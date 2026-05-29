import type { PostgrestError } from '@supabase/supabase-js';
import { v4 } from 'uuid';
import { ONE_DAY } from '../../config/constants';
import { firstElement } from '../../helpers';
import { supabase } from '../../lib/supabase';
import { ably } from '../ably';
import { evaluateBadgeMilestones } from '../badges/badge-monitor';
import { getNetworkById } from '../network';
import { getBaseInterest, getVaquitaPoolData, PROTOCOL_APY_DUMMY, VAQUITA_APY_DUMMY } from '../base';
import { getBlendInterest, getStellarDepositContractAddress } from '../stellar';
import {
  type Deposit,
  type DepositResponseDTO,
  DepositStatus,
  type DepositSummaryResponseDTO,
  type DepositWithdrawalResponseDTO,
  DepositWithdrawalState,
  type DepositWithState,
  type Network,
  type TokenNetwork,
  WithdrawalStatus,
} from '../../types';
import { getTokenNetworkByNetworkIdTokenId } from '../network';
import { toDepositSummaryResponseDTO } from './helpers';

export const listenDepositsChanges = async (onChange: () => void) => {
  await supabase.realtime.setAuth();
  supabase
    .channel(`table:deposits`, {
      config: { private: true },
    })
    .on('broadcast', { event: '*' }, () => {
      onChange();
    })
    .subscribe((status) => {
      console.info('Estado canal deposits:', status);
    });
};

export const listenWithdrawalsChanges = async (onChange: () => void) => {
  await supabase.realtime.setAuth();
  supabase
    .channel(`table:withdrawals`, {
      config: { private: true },
    })
    .on('broadcast', { event: '*' }, () => {
      onChange();
    })
    .subscribe((status) => {
      console.info('Estado canal withdrawals:', status);
    });
};

const broadcastDepositsChange = async (message: string) => {
  const channel = ably.channels.get('deposits-changes');
  console.info('broadcastDepositsChange:', message);
  await channel.publish('change', {
    message,
    timestamp: Date.now(),
  });
};

export const creteWithdrawal = async (withdrawal: {
  transactionHash: string,
  depositId: number,
  transactionEventRaw: string
}) => {
  const response = await supabase
    .from('withdrawals')
    .insert({
      status: WithdrawalStatus.INITIATED,
      transaction_hash: withdrawal.transactionHash,
      deposit_id: withdrawal.depositId,
      transaction_event_raw: withdrawal.transactionEventRaw,
    });
  await broadcastDepositsChange('creteWithdrawal');
  return response;
};

export const creteConfirmWithdrawal = async (withdrawal: {
  transactionHash: string,
  depositId: number,
  transactionEventRaw: string
}) => {
  const response = await supabase
    .from('withdrawals')
    .insert({
      status: WithdrawalStatus.CONFIRMED,
      transaction_hash: withdrawal.transactionHash,
      deposit_id: withdrawal.depositId,
      transaction_event_raw: withdrawal.transactionEventRaw,
    });
  
  await broadcastDepositsChange('creteConfirmWithdrawal');
  
  return response;
};

export const creteWithdrawalWithDepositTx = async (withdrawal: {
  transactionHash: string,
  transactionEventRaw: string
}, depositIdHex: string, networkId: number, vaquitaContractAddress: string) => {
  
  const { data: depositData, error: depositError } = await supabase
    .from('deposits')
    .select('id')
    .eq('deposit_id_hex', depositIdHex)
    .eq('network_id', networkId)
    .eq('vaquita_contract_address', vaquitaContractAddress)
    .maybeSingle();
  
  if (!depositData || depositError) {
    const { data: depositDataLog } = await supabase
      .from('deposits')
      .select('id')
      .eq('deposit_id_hex', depositIdHex);
    console.error('Error on creteWithdrawalWithDepositTx get depositData', {
      withdrawal,
      depositIdHex,
      networkId,
      vaquitaContractAddress,
      depositDataLog,
    }, depositError);
  }
  const depositId = depositData?.id;
  const { error, ...rest } = await supabase
    .from('withdrawals')
    .insert({
      status: 'initiated',
      transaction_hash: withdrawal.transactionHash,
      deposit_id: depositId,
      transaction_event_raw: withdrawal.transactionEventRaw,
    })
    .select()
    .maybeSingle();
  
  if (error) {
    console.error('Error on creteWithdrawalWithDepositTx', { withdrawal, depositIdHex, depositId }, depositError);
  }
  
  await broadcastDepositsChange('creteWithdrawalWithDepositTx');
  
  return {
    error,
    ...rest,
    depositId,
  };
};

export const createDeposit = async (deposit: {
  transactionHash: string,
  transactionEventRaw: string,
  depositIdHex: string,
  amount: number,
  walletAddress: string,
  networkId: number,
  tokenId: number,
  lockPeriod: number,
  vaquitaContract: string,
}) => {
  
  const newDeposit = {
    status: DepositStatus.INITIATED,
    deposit_id_hex: deposit.depositIdHex,
    amount: deposit.amount,
    wallet_address: deposit.walletAddress,
    network_id: deposit.networkId,
    token_id: deposit.tokenId,
    transaction_hash: deposit.transactionHash,
    transaction_event_raw: deposit.transactionEventRaw,
    lock_period: deposit.lockPeriod,
    vaquita_contract_address: deposit.vaquitaContract,
  };
  
  const result = await supabase
    .from('deposits')
    .insert([ newDeposit ])
    .select()
    .maybeSingle();
  
  await broadcastDepositsChange('createDeposit');
  
  return result;
};

export const createDepositByNames = async (depositIdHex: string, amount: number, walletAddress: string, networkName: string, tokenSymbol: string, lockPeriod: number, vaquitaContract: string) => {
  
  const { data: networkData, error: networkError } = await supabase
    .from('networks')
    .select('id')
    .eq('name', networkName)
    .maybeSingle();
  
  if (networkError || !networkData) {
    throw new Error(`Network not found "${networkName}"`);
  }
  
  const { data: tokenData, error: tokenError } = await supabase
    .from('tokens')
    .select('id')
    .eq('symbol', tokenSymbol)
    .maybeSingle();
  
  if (tokenError || !tokenData) {
    throw new Error(`Token not found "${tokenSymbol}"`);
  }
  
  return createDeposit({
    transactionEventRaw: '',
    transactionHash: 'initial_' + v4(),
    depositIdHex,
    amount,
    walletAddress,
    networkId: networkData.id,
    tokenId: tokenData.id,
    lockPeriod,
    vaquitaContract,
  });
};

export const confirmDepositWithTx = async (depositId: number, depositIdHex: string, txHash: string, transactionRaw: string) => {
  const response = await supabase
    .from('deposits')
    .update({
      status: DepositStatus.CONFIRMED,
      deposit_id_hex: depositIdHex,
      transaction_hash: txHash,
      transaction_event_raw: transactionRaw,
    })
    .eq('id', depositId)
    .maybeSingle();
  
  await broadcastDepositsChange('confirmDepositWithTx');
  
  return response;
};

export const _updateDeposit = async (depositId: number, update: any) => {
  const { error, ...rest } = await supabase
    .from('deposits')
    .update(update)
    .eq('id', depositId)
    .maybeSingle();
  if (error) {
    console.error('Error on _updateDeposit', { depositId, update }, error);
  }
  
  await broadcastDepositsChange('_updateDeposit');
  
  return {
    error,
    ...rest,
  };
};

export const failDepositWithTx = async (depositId: number, depositIdHex: string, txHash: string, transactionRaw: string) => {
  const response = await supabase
    .from('deposits')
    .update({
      status: DepositStatus.FAILED,
      deposit_id_hex: depositIdHex,
      transaction_hash: txHash,
      transaction_event_raw: transactionRaw,
    })
    .eq('id', depositId)
    .maybeSingle();
  
  await broadcastDepositsChange('failDepositWithTx');
  
  return response;
};

export const confirmDeposit = async (depositId: number) => {
  const { error, ...rest } = await supabase
    .from('deposits')
    .update({ status: DepositStatus.CONFIRMED, confirmed_at: new Date() })
    .eq('id', depositId)
    .maybeSingle();
  if (error) {
    console.error('Error on confirmDeposit', { depositId }, error);
  }
  
  await broadcastDepositsChange('confirmDeposit');
  
  return {
    error,
    ...rest,
  };
};

export const confirmWithdrawal = async (withdrawalId: number) => {
  const { error, ...rest } = await supabase
    .from('withdrawals')
    .update({ status: WithdrawalStatus.CONFIRMED, confirmed_at: new Date() })
    .eq('id', withdrawalId)
    .maybeSingle();
  if (error) {
    console.error('Error on confirmWithdrawal', { withdrawalId }, error);
  }

  // Fetch wallet address to evaluate badge milestones (fire-and-forget)
  if (!error) {
    void (async () => {
      try {
        const { data } = await supabase
          .from('withdrawals')
          .select('deposits!deposit_id(wallet_address, network_id)')
          .eq('id', withdrawalId)
          .maybeSingle();
        const wallet = (data as any)?.deposits?.wallet_address as string | undefined;
        const networkId = (data as any)?.deposits?.network_id as number | undefined;
        if (!wallet) return;
        const contractAddress = networkId
          ? ((await getNetworkById(networkId)).data?.badges_contract_address ?? null)
          : null;
        await evaluateBadgeMilestones(wallet, contractAddress);
      } catch {
        // Non-critical: badge evaluation errors must not affect withdrawal confirmation
      }
    })();
  }

  await broadcastDepositsChange('confirmWithdrawal');

  return {
    error,
    ...rest,
  };
};

export const _updateWithdrawal = async (withdrawalId: number, update: any) => {
  const { error, ...rest } = await supabase
    .from('withdrawals')
    .update(update)
    .eq('id', withdrawalId)
    .maybeSingle();
  if (error) {
    console.error('Error on _updateWithdrawal', { withdrawalId, update }, error);
  }
  
  await broadcastDepositsChange('_updateWithdrawal');
  
  return {
    error,
    ...rest,
  };
};

const toDepositWithState = (deposit: Deposit): DepositWithState => {
  let state = DepositWithdrawalState.NONE;
  
  if (deposit.status === DepositStatus.INITIATED) {
    state = DepositWithdrawalState.DEPOSIT_PROCESSING;
  } else if (deposit.status === DepositStatus.CONFIRMED && !!deposit.transaction_hash && !!deposit.deposit_id_hex) {
    state = DepositWithdrawalState.DEPOSIT_SUCCESS;
    if (deposit.withdrawals?.length > 0) {
      if (deposit.withdrawals.some(withdrawal => withdrawal.status === WithdrawalStatus.CONFIRMED && !!withdrawal.reward)) {
        state = DepositWithdrawalState.WITHDRAW_SUCCESS;
      } else if (deposit.withdrawals.some(withdrawal => withdrawal.status === WithdrawalStatus.CONFIRMED)) {
        state = DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY;
      } else if (deposit.withdrawals.some(withdrawal => withdrawal.status === WithdrawalStatus.INITIATED)) {
        state = DepositWithdrawalState.WITHDRAW_PROCESSING;
      } else {
        state = DepositWithdrawalState.WITHDRAW_FAILED;
      }
    }
  } else {
    state = DepositWithdrawalState.DEPOSIT_FAILED;
  }
  
  return {
    ...deposit,
    state,
  };
};

export const getDepositsById = async (id: number) => {
  const { data, ...rest } = await supabase
    .from('deposits')
    .select('*, withdrawals(*), tokens(*)')
    .eq('id', id)
    .maybeSingle();
  
  return {
    data: toDepositWithState(data),
    ...rest,
  };
};

export const getDepositsByTransactionHash = async (transactionHash: string) => {
  const { data, error, ...rest } = await supabase
    .from('deposits')
    .select('*, withdrawals(*), tokens(*)')
    .eq('transaction_hash', transactionHash)
    .maybeSingle();
  
  return {
    data: (!!data && !error) ? toDepositWithState(data) : null,
    error,
    ...rest,
  };
};

const getDepositsByNetworkIdWalletAddress = async (networkId: number, walletAddress: string) => {
  const { data, ...rest } = await supabase
    .from('deposits')
    .select('*, withdrawals(*), tokens(*)')
    .eq('network_id', networkId)
    .eq('wallet_address', walletAddress);
  return {
    data: ((data || []) as Deposit[]).map(toDepositWithState),
    ...rest,
    cached: false,
  };
};

export let depositsCacheRef: {
  current: { [key: string]: Awaited<ReturnType<typeof getDepositsByNetworkIdWalletAddress>> }
} = { current: {} };

export const getCachedDepositsByNetworkIdWalletAddress = async (networkId: number, walletAddress: string) => {
  // const key = `${networkId}_${walletAddress}`;
  // const dataCached = depositsCacheRef.current[key];
  // if (dataCached) {
  //   dataCached.cached = true;
  //   return dataCached;
  // }
  
  const data = await getDepositsByNetworkIdWalletAddress(networkId, walletAddress);
  // depositsCacheRef.current[key] = data;
  return data;
};

export const getDepositsByNetworkId = async (networkId: number) => {
  const { data, ...rest } = await supabase
    .from('deposits')
    .select('*, withdrawals(*), tokens(*)')
    .eq('network_id', networkId);
  return {
    data: ((data || []) as Deposit[]).map(toDepositWithState),
    ...rest,
  };
};

export const getWithdrawalByTransactionHash = async (transactionHash: string) => {
  const { data, ...rest } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('transaction_hash', transactionHash)
    .maybeSingle();
  
  return {
    data,
    ...rest,
  };
};

const toDepositWithdrawalResponseDTO = (withdrawal: Deposit['withdrawals'][number]): DepositWithdrawalResponseDTO => {
  return {
    confirmedTimestamp: new Date(withdrawal?.confirmed_at).getTime(),
    createdTimestamp: new Date(withdrawal?.created_at).getTime(),
    id: withdrawal?.id ?? 0,
    status: withdrawal?.status ?? WithdrawalStatus.FAILED,
    transactionHash: withdrawal?.transaction_hash ?? '',
    updatedTimestamp: new Date(withdrawal?.updated_at).getTime(),
  };
};

export const toDepositResponseDTO = async (deposit: DepositWithState, networkData: Network, tokenNetworkData: TokenNetwork | null, tempCache: any): Promise<DepositResponseDTO> => {
  
  let aaveInterest = 0;
  let blendInterest = 0;
  let vaquitaInterest = 0;
  
  // Control vaquita contract address
  let vaquitaContractAddress = tokenNetworkData?.vaquita_contract_address ?? '';
  if (tokenNetworkData) {
    if (networkData.name === 'Base Sepolia Testnet' || networkData.name === 'Base') {
      // contractAddress = getBaseDepositContractAddress(deposit);
    } else if (networkData.name === 'Stellar Testnet') {
      vaquitaContractAddress = getStellarDepositContractAddress(deposit);
    }
  }
  
  if (deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS) {
    if (tokenNetworkData) {
      if (networkData.name === 'Dummy') {
        aaveInterest = deposit.amount * (PROTOCOL_APY_DUMMY / 100);
        vaquitaInterest = deposit.amount * (((VAQUITA_APY_DUMMY[deposit.lock_period] ?? 0) / 100) / (ONE_DAY * 365 / deposit.lock_period));
      } else if (networkData.name === 'Base Sepolia Testnet' || networkData.name === 'Base') {
        const {
          poolReserveData,
        } = await getVaquitaPoolData(networkData, tokenNetworkData, deposit.lock_period / 1000, tempCache);
        if (poolReserveData) {
          ({
            aaveInterest,
            vaquitaInterest,
          } = await getBaseInterest(networkData, deposit, tokenNetworkData));
        }
      } else if (networkData.name === 'Stellar Testnet') {
        ({ blendInterest, vaquitaInterest } = await getBlendInterest(deposit, tokenNetworkData));
      }
    }
  }
  
  const lockPeriod = deposit.lock_period || +(networkData.tokens_networks.find(tokenNetwork => tokenNetwork.tokens.symbol === deposit.tokens?.symbol)?.lock_period?.split(',')?.[0] ?? 0) || 0;
  return {
    ...toDepositSummaryResponseDTO({ ...deposit, lock_period: lockPeriod }),
    walletAddress: deposit.wallet_address,
    withdrawals: deposit.withdrawals?.map(toDepositWithdrawalResponseDTO) ?? [],
    status: deposit.status,
    transactionHash: deposit.transaction_hash,
    depositIdHex: deposit.deposit_id_hex,
    aaveInterest,
    vaquitaInterest,
    blendInterest,
    ...(networkData.name === 'Stellar Testnet' ? { vaultInterest: blendInterest } : {}),
    lockPeriod,
    createdTimestamp: new Date(deposit.created_at || 0).getTime() || 0,
    updatedTimestamp: new Date(deposit.updated_at || 0).getTime() || 0,
    serverTimestamp: new Date().getTime(),
    confirmedTimestamp: new Date(deposit.confirmed_at || 0).getTime() || 0,
  };
};

export const dataToDepositResponseDTOTotalDepositsResponseDTO = async (networkData: Network, data: DepositWithState[], all: boolean, complete: boolean) => {
  const newData: (DepositResponseDTO | DepositSummaryResponseDTO)[] = [];
  const tempCache = {};
  const cache: {
    [key: string]:
      { error: PostgrestError, count: null, status: number, statusText: string, data: TokenNetwork | null } |
      { error: null, count: number | null, status: number, statusText: string, data: TokenNetwork | null }
  } = {};
  
  for (const deposit of data) {
    if (!all && (deposit.status === DepositStatus.FAILED || deposit.state === DepositWithdrawalState.DEPOSIT_FAILED || deposit.state === DepositWithdrawalState.NONE)) {
      continue;
    }
    
    const cacheKey = `${deposit.network_id}_${deposit.token_id}`;
    if (!cache[cacheKey]) {
      cache[cacheKey] = await getTokenNetworkByNetworkIdTokenId(deposit.network_id, deposit.token_id);
    }
    
    const { data: tokenNetworkData } = cache[cacheKey];
    
    if (!all && deposit.vaquita_contract_address !== firstElement(tokenNetworkData?.vaquita_contract_address ?? '')) {
      // continue;
    }
    if (complete) {
      const depositResponse = await toDepositResponseDTO(deposit, networkData, tokenNetworkData, tempCache);
      newData.push(depositResponse);
    } else {
      const depositResponse = toDepositSummaryResponseDTO(deposit);
      newData.push(depositResponse);
    }
  }
  
  // const empty = () => ({
  //   totalCount: 0,
  //   totalAmount: 0,
  //   totalAaveInterest: 0,
  //   totalBlendInterest: 0,
  //   totalVaquitaInterest: 0,
  //   totalAaveApy: 0,
  //   totalBlendApy: 0,
  //   totalVaquitaApy: 0,
  // });
  // const totalEmpty = () => ({
  //   [DepositWithdrawalState.NONE]: empty(),
  //   [DepositWithdrawalState.DEPOSIT_PROCESSING]: empty(),
  //   [DepositWithdrawalState.DEPOSIT_SUCCESS]: empty(),
  //   [DepositWithdrawalState.DEPOSIT_FAILED]: empty(),
  //   [DepositWithdrawalState.WITHDRAW_PROCESSING]: empty(),
  //   [DepositWithdrawalState.WITHDRAW_SUCCESS]: empty(),
  //   [DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY]: empty(),
  //   [DepositWithdrawalState.WITHDRAW_FAILED]: empty(),
  // });
  //
  // const totals: TotalDepositsResponseDTO = {};
  // for (const deposit of newData) {
  //   if (!totals[deposit.tokenSymbol]) {
  //     totals[deposit.tokenSymbol] = totalEmpty();
  //   }
  //   totals[deposit.tokenSymbol]![deposit.state].totalCount++;
  //   totals[deposit.tokenSymbol]![deposit.state].totalAmount += deposit.amount;
  //   totals[deposit.tokenSymbol]![deposit.state].totalAaveInterest += deposit.aaveInterest;
  //   totals[deposit.tokenSymbol]![deposit.state].totalBlendInterest += deposit.blendInterest;
  //   totals[deposit.tokenSymbol]![deposit.state].totalVaquitaInterest += deposit.vaquitaInterest;
  // }
  
  return {
    deposits: newData.sort((a, b) => b.id - a.id),
  };
};
