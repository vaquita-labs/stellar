import { v4 } from 'uuid';
import { prisma } from '@vaquita/db';
import { firstElement } from '../../helpers';
import { ably } from '../ably';
import { evaluateBadgeMilestones } from '../badges/badge-monitor';
import { notify } from '../notifications';
import { getBadgesContractAddress } from '../project-config';
import { getBlendInterest, isStellarNetworkName } from '../stellar';
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
import { getTokenNetworkByNetworkIdTokenId, SINGLE_NETWORK_ID, toTokenShape } from '../network';
import { toDepositSummaryResponseDTO } from './helpers';

const broadcastDepositsChange = async (message: string) => {
  const channel = ably.channels.get('deposits-changes');
  console.info('broadcastDepositsChange:', message);
  await channel.publish('change', {
    message,
    timestamp: Date.now(),
  });
};

const iso = (date: Date | null | undefined): string => (date ? date.toISOString() : '');

/** Maps a Prisma deposit row (optionally with `withdrawals`/`token` relations)
 *  back to the legacy snake_case `Deposit` shape the DTO + stellar layers use. */
const toDepositShape = (row: any): Deposit => ({
  id: row.id,
  wallet_address: row.walletAddress,
  amount: Number(row.amount),
  status: row.status as DepositStatus,
  // Legacy field: the app is single-network, so every deposit maps to the one config network.
  network_id: SINGLE_NETWORK_ID,
  // lock_period is a bigint column (ms); the DTO contract is number, so coerce.
  lock_period: Number(row.lockPeriod ?? 0),
  token_id: row.tokenId,
  deposit_id_hex: row.depositIdHex ?? '',
  nonce: row.nonce != null ? String(row.nonce) : null,
  transaction_hash: row.transactionHash ?? '',
  transaction_event_raw: row.transactionEventRaw ?? '',
  vaquita_contract_address: row.vaquitaContractAddress ?? '',
  withdrawals: (row.withdrawals ?? []).map((w: any) => ({
    confirmed_at: iso(w.confirmedAt),
    created_at: iso(w.createdAt),
    deposit_id: w.depositId,
    id: w.id,
    status: w.status as WithdrawalStatus,
    reward: w.reward != null ? Number(w.reward) : 0,
    transaction_event_raw: w.transactionEventRaw ?? '',
    transaction_hash: w.transactionHash ?? '',
    updated_at: iso(w.updatedAt),
  })),
  tokens: row.token ? toTokenShape(row.token) : null,
  created_at: iso(row.createdAt),
  updated_at: iso(row.updatedAt),
  confirmed_at: iso(row.confirmedAt),
});

const depositInclude = { withdrawals: true, token: true } as const;

export const creteWithdrawal = async (withdrawal: {
  transactionHash: string,
  depositId: number,
  transactionEventRaw: string
}) => {
  try {
    const data = await prisma.withdrawal.create({
      data: {
        status: WithdrawalStatus.INITIATED,
        transactionHash: withdrawal.transactionHash,
        depositId: withdrawal.depositId,
        transactionEventRaw: withdrawal.transactionEventRaw,
      },
    });
    await broadcastDepositsChange('creteWithdrawal');
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const creteConfirmWithdrawal = async (withdrawal: {
  transactionHash: string,
  depositId: number,
  transactionEventRaw: string
}) => {
  try {
    const data = await prisma.withdrawal.create({
      data: {
        status: WithdrawalStatus.CONFIRMED,
        transactionHash: withdrawal.transactionHash,
        depositId: withdrawal.depositId,
        transactionEventRaw: withdrawal.transactionEventRaw,
      },
      include: { deposit: { select: { walletAddress: true, amount: true } } },
    });
    void notify({
      walletAddress: data.deposit.walletAddress,
      type: 'deposit',
      messageKey: 'withdrawalCompleted',
      params: { amount: Number(data.transferAmount ?? data.deposit.amount).toFixed(2) },
      link: '/transactions',
      dedupeKey: `withdrawal-confirmed-${data.id}`,
    });
    await broadcastDepositsChange('creteConfirmWithdrawal');
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const creteWithdrawalWithDepositTx = async (withdrawal: {
  transactionHash: string,
  transactionEventRaw: string
}, depositIdHex: string, _networkId: number, vaquitaContractAddress: string) => {
  try {
    const depositRow = await prisma.deposit.findFirst({
      where: { depositIdHex, vaquitaContractAddress },
      select: { id: true },
    });
    const depositId = depositRow?.id;

    if (!depositId) {
      console.error('Error on creteWithdrawalWithDepositTx get depositData', {
        withdrawal,
        depositIdHex,
        networkId: _networkId,
        vaquitaContractAddress,
      });
      return { error: new Error('Deposit not found for withdrawal'), data: null, depositId };
    }

    const data = await prisma.withdrawal.create({
      data: {
        status: WithdrawalStatus.INITIATED,
        transactionHash: withdrawal.transactionHash,
        depositId,
        transactionEventRaw: withdrawal.transactionEventRaw,
      },
    });

    await broadcastDepositsChange('creteWithdrawalWithDepositTx');

    return { error: null, data, depositId };
  } catch (error) {
    console.error('Error on creteWithdrawalWithDepositTx', { withdrawal, depositIdHex }, error);
    return { error: error as Error, data: null, depositId: undefined };
  }
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
  nonce?: string | number | bigint | null,
}) => {
  try {
    const row = await prisma.deposit.create({
      data: {
        status: DepositStatus.INITIATED,
        depositIdHex: deposit.depositIdHex,
        nonce: deposit.nonce != null && deposit.nonce !== '' ? BigInt(deposit.nonce) : null,
        amount: deposit.amount,
        walletAddress: deposit.walletAddress,
        tokenId: deposit.tokenId,
        transactionHash: deposit.transactionHash,
        transactionEventRaw: deposit.transactionEventRaw,
        lockPeriod: deposit.lockPeriod,
        vaquitaContractAddress: deposit.vaquitaContract,
      },
    });

    await broadcastDepositsChange('createDeposit');

    return { data: toDepositShape(row), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

/**
 * Next deposit nonce for a wallet: a per-wallet monotonic counter used to derive
 * the on-chain position id (`sha256(caller || nonce)`). Computed as
 * `MAX(nonce) + 1` over ALL of the wallet's deposits (including soft-deleted), so
 * a value is never reused. Concurrency is handled at insert time by the
 * `UNIQUE(wallet_address, nonce)` index — a losing writer retries with the next
 * value. Returned as a string to preserve the full u64 range.
 */
export const getNextDepositNonce = async (walletAddress: string) => {
  try {
    const agg = await prisma.deposit.aggregate({
      where: { walletAddress },
      _max: { nonce: true },
    });
    const max = agg._max.nonce;
    const next = max != null ? max + 1n : 0n;
    return { data: { nonce: next.toString() }, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const createDepositByNames = async (depositIdHex: string, amount: number, walletAddress: string, networkName: string, tokenSymbol: string, lockPeriod: number, vaquitaContract: string, nonce?: string | number | bigint | null) => {

  const config = await prisma.config.findFirst({ select: { networkName: true } });
  if (!config || config.networkName !== networkName) {
    throw new Error(`Network not found "${networkName}"`);
  }

  const token = await prisma.token.findFirst({
    where: { symbol: tokenSymbol, deletedAt: null },
    select: { id: true },
  });
  if (!token) {
    throw new Error(`Token not found "${tokenSymbol}"`);
  }

  return createDeposit({
    transactionEventRaw: '',
    transactionHash: 'initial_' + v4(),
    depositIdHex,
    amount,
    walletAddress,
    networkId: SINGLE_NETWORK_ID,
    tokenId: token.id,
    lockPeriod,
    vaquitaContract,
    nonce: nonce ?? null,
  });
};

export const confirmDepositWithTx = async (depositId: number, depositIdHex: string, txHash: string, transactionRaw: string) => {
  try {
    const data = await prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: DepositStatus.CONFIRMED,
        depositIdHex,
        transactionHash: txHash,
        transactionEventRaw: transactionRaw,
      },
    });

    void notify({
      walletAddress: data.walletAddress,
      type: 'deposit',
      messageKey: 'depositConfirmed',
      params: { amount: Number(data.amount).toFixed(2) },
      link: '/transactions',
      dedupeKey: `deposit-confirmed-${data.id}`,
    });

    await broadcastDepositsChange('confirmDepositWithTx');

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const _updateDeposit = async (depositId: number, update: any) => {
  try {
    const data = await prisma.deposit.update({ where: { id: depositId }, data: update });
    await broadcastDepositsChange('_updateDeposit');
    return { data, error: null };
  } catch (error) {
    console.error('Error on _updateDeposit', { depositId, update }, error);
    return { data: null, error: error as Error };
  }
};

export const failDepositWithTx = async (depositId: number, depositIdHex: string, txHash: string, transactionRaw: string) => {
  try {
    const data = await prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: DepositStatus.FAILED,
        depositIdHex,
        transactionHash: txHash,
        transactionEventRaw: transactionRaw,
      },
    });

    await broadcastDepositsChange('failDepositWithTx');

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const confirmDeposit = async (depositId: number) => {
  try {
    const data = await prisma.deposit.update({
      where: { id: depositId },
      data: { status: DepositStatus.CONFIRMED, confirmedAt: new Date() },
    });
    void notify({
      walletAddress: data.walletAddress,
      type: 'deposit',
      messageKey: 'depositConfirmed',
      params: { amount: Number(data.amount).toFixed(2) },
      link: '/transactions',
      dedupeKey: `deposit-confirmed-${data.id}`,
    });
    await broadcastDepositsChange('confirmDeposit');
    return { data, error: null };
  } catch (error) {
    console.error('Error on confirmDeposit', { depositId }, error);
    return { data: null, error: error as Error };
  }
};

export const confirmWithdrawal = async (withdrawalId: number) => {
  try {
    const data = await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: WithdrawalStatus.CONFIRMED, confirmedAt: new Date() },
      include: { deposit: { select: { walletAddress: true, amount: true } } },
    });

    // Fire-and-forget badge evaluation. Non-critical: errors must not affect
    // withdrawal confirmation.
    const wallet = data?.deposit?.walletAddress;
    if (wallet) {
      void notify({
        walletAddress: wallet,
        type: 'deposit',
        messageKey: 'withdrawalCompleted',
        params: { amount: Number(data.transferAmount ?? data.deposit.amount).toFixed(2) },
        link: '/transactions',
        dedupeKey: `withdrawal-confirmed-${data.id}`,
      });
      void (async () => {
        try {
          const contractAddress = await getBadgesContractAddress();
          await evaluateBadgeMilestones(wallet, contractAddress);
        } catch {
          // intentionally ignored
        }
      })();
    }

    await broadcastDepositsChange('confirmWithdrawal');

    return { data, error: null };
  } catch (error) {
    console.error('Error on confirmWithdrawal', { withdrawalId }, error);
    return { data: null, error: error as Error };
  }
};

export const _updateWithdrawal = async (withdrawalId: number, update: any) => {
  try {
    const data = await prisma.withdrawal.update({ where: { id: withdrawalId }, data: update });
    await broadcastDepositsChange('_updateWithdrawal');
    return { data, error: null };
  } catch (error) {
    console.error('Error on _updateWithdrawal', { withdrawalId, update }, error);
    return { data: null, error: error as Error };
  }
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
  try {
    const row = await prisma.deposit.findUnique({ where: { id }, include: depositInclude });
    if (!row) return { data: null, error: null };
    return { data: toDepositWithState(toDepositShape(row)), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const getDepositsByTransactionHash = async (transactionHash: string) => {
  try {
    const row = await prisma.deposit.findFirst({ where: { transactionHash }, include: depositInclude });
    return { data: row ? toDepositWithState(toDepositShape(row)) : null, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

const getDepositsByNetworkIdWalletAddress = async (_networkId: number, walletAddress: string) => {
  try {
    // Single-network: filter by wallet only (deposits no longer carry a network_id).
    // `deletedAt: null` es clave: sin él, un depósito soft-borrado (ej. de un pool
    // contract viejo, o una posición que ya no existe on-chain) seguía apareciendo
    // como posición en el portafolio — el soft-delete no ocultaba nada.
    const rows = await prisma.deposit.findMany({
      where: { walletAddress, deletedAt: null },
      include: depositInclude,
    });
    return { data: rows.map(row => toDepositWithState(toDepositShape(row))), error: null, cached: false };
  } catch (error) {
    return { data: [] as DepositWithState[], error: error as Error, cached: false };
  }
};

export let depositsCacheRef: {
  current: { [key: string]: Awaited<ReturnType<typeof getDepositsByNetworkIdWalletAddress>> }
} = { current: {} };

export const getCachedDepositsByNetworkIdWalletAddress = async (networkId: number, walletAddress: string) => {
  const data = await getDepositsByNetworkIdWalletAddress(networkId, walletAddress);
  return data;
};

export const getDepositsByNetworkId = async (_networkId: number) => {
  try {
    // Single-network: every deposit belongs to the one configured network.
    // Excluimos soft-borrados (misma razón que la query por wallet): no deben
    // contarse ni listarse como posiciones vivas.
    const rows = await prisma.deposit.findMany({ where: { deletedAt: null }, include: depositInclude });
    return { data: rows.map(row => toDepositWithState(toDepositShape(row))), error: null };
  } catch (error) {
    return { data: [] as DepositWithState[], error: error as Error };
  }
};

/**
 * How many open positions this lock period currently holds. "Open" = the same
 * live-deposit shape the app shows: confirmed on-chain, no confirmed withdrawal.
 * Counts POSITIONS, not distinct wallets — one wallet with two deposits in the
 * same term counts twice (matches the on-chain PositionCountForPeriod notion).
 *
 * This is the social-proof number the portfolio shows next to the reward pool,
 * replacing the misleading APY. `lockPeriodMs` is the same ms value the APY
 * endpoint receives; deposits store `lock_period` in that unit.
 */
export const countOpenPositionsByLockPeriod = async (lockPeriodMs: number): Promise<number> => {
  try {
    return await prisma.deposit.count({
      where: {
        lockPeriod: BigInt(Math.trunc(lockPeriodMs)),
        deletedAt: null,
        status: DepositStatus.CONFIRMED,
        transactionHash: { not: null },
        depositIdHex: { not: null },
        withdrawals: { none: { status: WithdrawalStatus.CONFIRMED } },
      },
    });
  } catch (error) {
    console.error('countOpenPositionsByLockPeriod', error);
    return 0;
  }
};

export const getWithdrawalByTransactionHash = async (transactionHash: string) => {
  try {
    const data = await prisma.withdrawal.findFirst({ where: { transactionHash } });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
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

  let protocolInterest = 0;
  let blendInterest = 0;
  let vaquitaInterest = 0;

  // Realized interest is read from chain, and `getBlendInterest` resolves the
  // pool and vault contracts from the deposit itself, so it works the same on
  // both networks. Gating it on testnet alone made mainnet positions report
  // $0.00 earnings everywhere they are shown.
  if (deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS && tokenNetworkData && isStellarNetworkName(networkData.name)) {
    ({ blendInterest, vaquitaInterest } = await getBlendInterest(deposit, tokenNetworkData));
  }

  const lockPeriod = deposit.lock_period || +(networkData.tokens_networks.find(tokenNetwork => tokenNetwork.tokens.symbol === deposit.tokens?.symbol)?.lock_period?.split(',')?.[0] ?? 0) || 0;
  return {
    ...toDepositSummaryResponseDTO({ ...deposit, lock_period: lockPeriod }),
    walletAddress: deposit.wallet_address,
    withdrawals: deposit.withdrawals?.map(toDepositWithdrawalResponseDTO) ?? [],
    status: deposit.status,
    transactionHash: deposit.transaction_hash,
    depositIdHex: deposit.deposit_id_hex,
    nonce: (deposit as { nonce?: bigint | number | string | null }).nonce != null
      ? String((deposit as { nonce?: bigint | number | string | null }).nonce)
      : null,
    protocolInterest,
    vaquitaInterest,
    blendInterest,
    ...(isStellarNetworkName(networkData.name) ? { vaultInterest: blendInterest } : {}),
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
  const cache: { [key: string]: Awaited<ReturnType<typeof getTokenNetworkByNetworkIdTokenId>> } = {};

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

  return {
    deposits: newData.sort((a, b) => b.id - a.id),
  };
};
