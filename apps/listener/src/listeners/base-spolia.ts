import { ethers, type InterfaceAbi } from 'ethers';
import {
  _updateDeposit,
  _updateWithdrawal,
  confirmDeposit,
  confirmWithdrawal,
  createDeposit,
  creteWithdrawalWithDepositTx,
  DepositStatus,
  firstElement,
  getABIByAddressByNetworkId,
  getDepositsByTransactionHash,
  getDepositVaquitaPoolPositions,
  getNetworkByName,
  getTokenNetworkByContractAddressAndNetworkId,
  getWithdrawalByTransactionHash,
  type Network,
  ONE_DAY,
  type TokenNetwork,
  WithdrawalStatus,
} from '@vaquita/shared';

const BASE_SEPOLIA_TESTNET_NETWORK_NAME = 'Base Sepolia Testnet';
const BASE_NETWORK_NAME = 'Base';

const MAX_BLOCK_RANGE = 2000;
const POLLING_INTERVAL = 1000;

export function getConfirmationRequirements(value: number): { required: number; maxWaitMinutes: number } {
  if (value < 10) return { required: 5, maxWaitMinutes: 6 };
  if (value < 100) return { required: 10, maxWaitMinutes: 6 };
  if (value < 1000) return { required: 20, maxWaitMinutes: 12 };
  if (value < 10000) return { required: 30, maxWaitMinutes: 18 };
  if (value < 100000) return { required: 50, maxWaitMinutes: 48 };
  // For high-value transactions like $12M
  return { required: 200, maxWaitMinutes: 60 }; // 1 hour max wait
}

async function verifyTransaction(provider: ethers.JsonRpcProvider, amount: number, txHash: string) {
  const receipt = await provider.getTransactionReceipt(txHash);
  
  if (!receipt) {
    console.info('⏳ Aún no hay receipt (transacción pendiente)');
    return;
  }
  
  if (receipt.status === 1) {
    console.info(`✅ Transacción ${txHash} confirmada exitosamente`);
  } else {
    console.info(`❌ Transacción ${txHash} falló`);
  }
  
  const { required } = getConfirmationRequirements(amount);
  
  await provider.waitForTransaction(txHash, required);
  console.info(`🔒 Confirmada con ${required} bloques de seguridad`);
}

const getDataOfArgs = async (args: string[], token: {
  id: number,
  decimals: number
}, networkId: number, vaquitaContract: string) => {
  let tokenId = token.id;
  let tokenDecimals = token.decimals;
  if (networkId === 2 && vaquitaContract === '0x2bC60217Aa862696e96eB831B8b67BF0BB14D407') { // mainnet current main
    const depositIdHex = (args[0] || '').toString();
    const userWalletAddress = (args[1] || '').toString();
    const amount = Number(args[2] || 0) / (10 ** tokenDecimals);
    const shares = Number(args[3] || 0);
    return {
      depositIdHex,
      userWalletAddress,
      tokenContractAddress: '',
      amount,
      shares,
      lockPeriod: 0,
      tokenId,
      tokenDecimals,
    };
  } else { // default
    const depositIdHex = (args[0] || '').toString();
    const userWalletAddress = (args[1] || '').toString();
    const tokenContractAddress = (args[2] || '').toString();
    if (tokenContractAddress) {
      const { data, error } = await getTokenNetworkByContractAddressAndNetworkId(tokenContractAddress, networkId);
      if (data) {
        tokenDecimals = data.token_decimals;
        tokenId = data.tokens.id;
      } else {
        console.info(`No token found tokenContractAddress: "${tokenContractAddress}", networkId: "${networkId}"`, {
          data,
          error,
        });
      }
    }
    
    const lockPeriod = Number(args[3] || 0) * 1000;
    const amount = Number(args[4] || 0) / (10 ** tokenDecimals);
    const shares = Number(args[5] || 0);
    
    return {
      depositIdHex,
      userWalletAddress,
      tokenContractAddress,
      amount,
      shares,
      lockPeriod,
      tokenId,
      tokenDecimals,
    };
  }
  return {
    depositIdHex: '',
    userWalletAddress: '',
    tokenContractAddress: '',
    amount: 0,
    shares: 0,
    lockPeriod: 0,
    tokenId,
    tokenDecimals,
  };
};

const processFundsDeposited = async (provider: ethers.JsonRpcProvider, contract: ethers.Contract, networkId: number, event: ethers.Log | ethers.EventLog, token: {
  id: number,
  decimals: number
}) => {
  try {
    const parsedLog = contract.interface.parseLog(event);
    const vaquitaContractAddress = event.address;
    let {
      depositIdHex,
      userWalletAddress,
      amount,
      lockPeriod,
      tokenId,
    } = await getDataOfArgs(parsedLog?.args ?? [], token, networkId, vaquitaContractAddress);
    // console.info({
    //   event,
    //   depositIdHex,
    //   userWalletAddress,
    //   amount,
    //   lockPeriod,
    // });
    
    const transactionHash = event.transactionHash;
    const transactionEventRaw = JSON.stringify(event, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    
    const { data } = await getDepositsByTransactionHash(transactionHash);
    let isConfirmed = false;
    let depositId = 0;
    if (!!data) {
      depositId = data.id;
      isConfirmed = data.status === DepositStatus.CONFIRMED;
      console.info(`already exits deposit: (${depositId})`);
      if (data.transaction_hash !== transactionHash) {
        console.info(`DIFF (depositId: ${depositId}), transaction_hash "${data.transaction_hash}" "${transactionHash}"`);
      }
      if (data.transaction_event_raw !== transactionEventRaw) {
        console.info(`DIFF (depositId: ${depositId}), transaction_event_raw "${data.transaction_event_raw}" "${transactionEventRaw}"`);
      }
      if (data.deposit_id_hex !== depositIdHex) {
        console.info(`DIFF (depositId: ${depositId}), deposit_id_hex "${data.deposit_id_hex}" "${depositIdHex}"`);
      }
      if (data.amount !== amount) {
        console.info(`DIFF (depositId: ${depositId}), amount "${data.amount}" "${amount}"`);
      }
      if (data.wallet_address !== userWalletAddress) {
        console.info(`DIFF (depositId: ${depositId}), wallet_address "${data.wallet_address}" "${userWalletAddress}"`);
        if (!data.wallet_address && !!userWalletAddress) {
          const response = await _updateDeposit(depositId, { wallet_address: userWalletAddress });
          console.info('fixed(?):', response.error ? response : 'ok');
        }
      }
      if (!data.vaquita_contract_address || data.vaquita_contract_address !== vaquitaContractAddress) {
        console.info(`DIFF (depositId: ${depositId}), vaquita_contract_address "${data.vaquita_contract_address}" "${vaquitaContractAddress}"`);
        if (!data.vaquita_contract_address && !!vaquitaContractAddress) {
          const response = await _updateDeposit(depositId, { vaquita_contract_address: vaquitaContractAddress });
          console.info('fixed(?):', response.error ? response : 'ok');
        }
      }
    } else {
      if (lockPeriod === 0) {
        try {
          const depositData = await getDepositVaquitaPoolPositions(provider, vaquitaContractAddress, depositIdHex);
          lockPeriod = Number(depositData?.[4] || 0) * 1000;
        } catch (error) {
          console.error('error on getDepositVaquitaPoolPositions', error);
        }
      }
      
      const newDeposit = {
        transactionHash,
        transactionEventRaw,
        depositIdHex,
        amount,
        walletAddress: userWalletAddress,
        networkId,
        tokenId,
        lockPeriod,
        vaquitaContract: vaquitaContractAddress,
      };
      const { data, error } = await createDeposit(newDeposit);
      
      console.info('createDeposit', { depositId, data, error, newDeposit });
      
      if (data) {
        depositId = data?.id;
      }
    }
    
    if (!isConfirmed) {
      await verifyTransaction(provider, amount, event.transactionHash);
      await confirmDeposit(depositId);
    }
    if (lockPeriod === 0) {
      const depositData = await getDepositVaquitaPoolPositions(provider, vaquitaContractAddress, depositIdHex);
      const lockPeriod = Number(depositData?.[4] || 0) * 1000;
      await _updateDeposit(depositId, { lock_period: lockPeriod });
    }
  } catch (error) {
    console.error(error);
  }
};

const getWithdrawDataOfArgs = async (args: string[], token: {
  decimals: number
}, networkId: number) => {
  let tokenDecimals = token.decimals;
  if (networkId === 2 && false/*old transaction*/) { // mainnet current main
    const depositIdHex = (args[0] || '').toString();
    const userWalletAddress = (args[1] || '').toString();
    const transferAmount = (Number(args[2]) || 0) / (10 ** tokenDecimals);
    const interest = (Number(args[3]) || 0);
    const reward = (Number(args[4]) || 0);
    
    return {
      depositIdHex,
      userWalletAddress,
      tokenContractAddress: '',
      lockPeriod: 0,
      transferAmount,
      interest,
      reward,
    };
  } else { // default
    const depositIdHex = (args[0] || '').toString();
    const userWalletAddress = (args[1] || '').toString();
    const tokenContractAddress = (args[2] || '').toString();
    const lockPeriod = Number(args[3] || 0) * 1000;
    const transferAmount = (Number(args[4]) || 0) / (10 ** tokenDecimals);
    const interest = (Number(args[5]) || 0);
    const reward = (Number(args[6]) || 0);
    
    return {
      depositIdHex,
      userWalletAddress,
      tokenContractAddress,
      lockPeriod,
      transferAmount,
      interest,
      reward,
    };
  }
};

const processFundsWithdrawn = async (provider: ethers.JsonRpcProvider, contract: ethers.Contract, networkId: number, event: ethers.Log | ethers.EventLog, tokenDecimals: number, vaquitaContractAddress: string) => {
  try {
    const parsedLog = contract.interface.parseLog(event);
    let {
      depositIdHex, transferAmount, interest, reward,
    } = await getWithdrawDataOfArgs(parsedLog?.args ?? [], { decimals: tokenDecimals }, networkId);
    const transactionHash = event.transactionHash;
    const transactionEventRaw = JSON.stringify(event, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    const { data } = await getWithdrawalByTransactionHash(transactionHash);
    
    let withdrawalId = 0;
    let isConfirmed = false;
    if (!!data) {
      withdrawalId = data.id;
      isConfirmed = data.status === WithdrawalStatus.CONFIRMED;
      console.info(`already exits withdrawal (${withdrawalId}) of deposit ${data.deposit_id}`);
      if (!data.transaction_event_raw) {
        await _updateWithdrawal(withdrawalId, { transaction_event_raw: transactionEventRaw });
        console.info(`DIFF (withdrawalId: ${withdrawalId}), transaction_event_raw "${data.transaction_event_raw}" "${transactionEventRaw}" FIXED`);
      }
    } else {
      const newWithdrawal = {
        transactionHash,
        transactionEventRaw,
      };
      const result = await creteWithdrawalWithDepositTx(newWithdrawal, depositIdHex, networkId, vaquitaContractAddress);
      withdrawalId = result?.data?.id;
      if (result.error) {
        console.info('creteWithdrawalWithDepositTx with Error', { depositIdHex, result, newWithdrawal });
      } else {
        console.info(`creteWithdrawalWithDepositTx successfully (${withdrawalId}) of deposit ${result.depositId}`);
      }
    }
    console.info('withdrawal to verify', { isConfirmed, withdrawalId, transferAmount });
    if (!isConfirmed) {
      await verifyTransaction(provider, transferAmount, event.transactionHash);
      console.info('verified!!', event.transactionHash, { withdrawalId });
      const result = await confirmWithdrawal(withdrawalId);
      if (result.error) {
        console.info('Error on confirmWithdrawal', result);
      }
    }
    await _updateWithdrawal(withdrawalId, { transfer_amount: transferAmount, interest, reward });
  } catch (error) {
    console.error(error);
  }
};

const getProviderData = async (providerUrl: string, tokenSymbol: string) => {
  const provider = new ethers.JsonRpcProvider(providerUrl);
  
  const network = await provider.getNetwork();
  const NETWORK_NAME = network.name === 'base' ? BASE_NETWORK_NAME : network.name === 'base-sepolia' ? BASE_SEPOLIA_TESTNET_NETWORK_NAME : '';
  let vaquitaContract = '';
  const { data: dataNetwork } = await getNetworkByName(NETWORK_NAME);
  let networkId = -1;
  let tokenId = -1;
  let tokenDecimals = 0;
  let abi = null;
  if (dataNetwork) {
    networkId = dataNetwork.id;
    for (const tokenNetwork of dataNetwork?.tokens_networks) {
      if (tokenNetwork?.tokens?.symbol === tokenSymbol) {
        tokenId = tokenNetwork.tokens.id;
        vaquitaContract = firstElement(tokenNetwork?.vaquita_contract_address);
        tokenDecimals = tokenNetwork?.tokens.decimals;
        abi = await getABIByAddressByNetworkId(vaquitaContract, networkId);
      }
    }
  }
  const currentBlock = await provider.getBlockNumber();
  
  return {
    network,
    provider,
    networkId,
    tokenId,
    tokenDecimals,
    currentBlock,
    vaquitaContract,
    abi,
  };
};

const listen = async (providerUrl: string, networkData: Network, tokenNetworkData: TokenNetwork, vaquitaContractAddress: string) => {
  const provider = new ethers.JsonRpcProvider(providerUrl);
  const currentBlock = await provider.getBlockNumber();
  const network = await provider.getNetwork();
  
  let lastProcessedBlock: number;
  lastProcessedBlock = currentBlock - 1;
  const vaquitaContractAbi = await getABIByAddressByNetworkId(vaquitaContractAddress, networkData.id);
  const contract = new ethers.Contract(
    vaquitaContractAddress,
    vaquitaContractAbi as InterfaceAbi,
    provider,
  );
  console.info({ abi: !!vaquitaContractAbi });
  console.info('Vaquita contract address', vaquitaContractAddress);
  console.info('🌐 Red conectada:', network.name,  // Ej: 'base-sepolia'
    '🔢 Chain ID:', network.chainId,    // Ej: 84532
    '🪙 Token:', tokenNetworkData.tokens.symbol,
    `🚀 Escuchando TODOS los eventos desde el bloque ${lastProcessedBlock + 1}...`);
  while (true) {
    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    try {
      const latestBlock = await provider.getBlockNumber();
      if (latestBlock <= lastProcessedBlock) {
        continue;
      }
      
      for (let from = lastProcessedBlock + 1; from <= latestBlock; from += MAX_BLOCK_RANGE) {
        const to = Math.min(from + MAX_BLOCK_RANGE - 1, latestBlock);
        
        console.info(`🔍 Buscando eventos entre bloques ${from} y ${to}... (${networkData.name} - ${tokenNetworkData.tokens.symbol})`);
        
        const events = await contract.queryFilter('*', from, to);
        
        for (const event of events) {
          const parsedLog = contract.interface.parseLog(event);
          console.info({ event, parsedLog });
          
          if (parsedLog?.name === 'FundsDeposited') {
            void processFundsDeposited(provider, contract, networkData.id, event, {
              id: tokenNetworkData.tokens.id,
              decimals: tokenNetworkData.token_decimals,
            });
          } else if (parsedLog?.name === 'FundsWithdrawn') {
            void processFundsWithdrawn(provider, contract, networkData.id, event, tokenNetworkData.token_decimals, vaquitaContractAddress);
          }
        }
        
        lastProcessedBlock = to;
      }
    } catch (err) {
      console.error('❌ Error al buscar eventos:', err);
    }
  }
};

export async function startListeningBaseSepolia(providerUrl: string, networkName: string) {
  const vaquitaContracts: string[] = [];
  const { data } = await getNetworkByName(networkName);
  if (data) {
    for (const tokenNetwork of data.tokens_networks) {
      if (!tokenNetwork.is_supported) {
        continue;
      }
      for (const vaquitaContractAddress of tokenNetwork.vaquita_contract_address?.split(',') ?? []) {
        if (vaquitaContracts.includes(vaquitaContractAddress)) {
          continue;
        }
        vaquitaContracts.push(vaquitaContractAddress);
        void listen(providerUrl, data, tokenNetwork, vaquitaContractAddress);
      }
    }
  }
}

export async function getPastEventsBaseSepolia(days: number, providerUrl: string, tokenSymbol: string) {
  
  const {
    vaquitaContract,
    tokenId,
    tokenDecimals,
    networkId,
    abi,
  } = await getProviderData(providerUrl, tokenSymbol);
  const provider = new ethers.JsonRpcProvider(providerUrl);
  const contract = new ethers.Contract(
    vaquitaContract,
    abi as InterfaceAbi,
    provider,
  );
  console.info({
    vaquitaContract,
    tokenId,
    tokenDecimals,
    networkId,
    abi, providerUrl, tokenSymbol,
  });
  const latestBlock = await provider.getBlockNumber();
  
  // Estimación de bloques en ~30 días (12s/bloque)
  const BLOCKS_PER_MONTH = Math.floor((days * ONE_DAY / 1000) / 12); // ≈ 216,000
  const fromBlock = Math.max(latestBlock - BLOCKS_PER_MONTH, 0);
  
  console.info(`⏪ Buscando eventos del último mes: desde bloque ${fromBlock} hasta ${latestBlock}`);
  
  for (let from = fromBlock; from <= latestBlock; from += MAX_BLOCK_RANGE) {
    const to = Math.min(from + MAX_BLOCK_RANGE - 1, latestBlock);
    process.stdout.write(`\r🔍 Escaneando rango de bloques ${from} → ${to}...`);
    
    try {
      const events = await contract.queryFilter('*', from, to);
      if (events.length > 0) {
        console.info(`found ${events.length} events`);
      }
      for (const event of events) {
        const parsedLog = contract.interface.parseLog(event);
        console.info(`Parsed log name: ${parsedLog?.name}`);
        if (parsedLog?.name === 'FundsDeposited') {
          await processFundsDeposited(provider, contract, networkId, event, { id: tokenId, decimals: tokenDecimals });
        } else if (parsedLog?.name === 'FundsWithdrawn') {
          await processFundsWithdrawn(provider, contract, networkId, event, tokenDecimals, vaquitaContract);
        }
      }
    } catch (err) {
      console.error(`❌ Error al leer rango ${from}-${to}:`, err);
    }
  }
  
  console.info('✅ Terminado el barrido histórico del último mes');
}
