import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { aavePoolAbi } from '../../abi/aavePoolAbi';
import { VaquitaPoolAbi } from '../../abi/vaquitaPoolAbi';
import { ONE_HOUR } from '../../config/constants';
import { firstElement } from '../../helpers';
import { _updateDeposit } from '../deposit';
import type { DepositWithState, Network, TokenNetwork } from '../../types';
import {
  getBaseSepoliaSigner,
  getBaseSepoliaVaquitaContract,
  getBaseSigner,
  getBaseVaquitaContract,
  getVaquitaPoolPeriods,
} from './vaquita';

dotenv.config();

const accessManagedMsvAbi = [
  'function previewRedeem(uint256 shares) view returns (uint256 assets)',
];

let lastResponse: {
  [key: string]: {
    timestamp: number,
    accessManagedMsv: ethers.Contract,
    rewardPool: number,
    totalDeposits: number,
    totalShares: number,
    poolReserveData: any
  }
} = {};

const poolReserveDataRef: { [key: string]: { current: any | null, timestamp: number } } = {};

export const getCachedAaavePoolGetReserveData = async (networkData: Network, tokenNetworkData: TokenNetwork) => {
  const key = `${tokenNetworkData.aave_pool_contract_address}_${tokenNetworkData.aave_token_contract_address}`;
  if (!!poolReserveDataRef[key] && !!poolReserveDataRef[key].current && Date.now() - poolReserveDataRef[key].timestamp <= ONE_HOUR) {
    return poolReserveDataRef[key].current;
  }
  try {
    const signer = networkData.name === 'Base' ? getBaseSigner() : getBaseSepoliaSigner();
    const aavePool = new ethers.Contract(tokenNetworkData.aave_pool_contract_address, aavePoolAbi, signer);
    poolReserveDataRef[key] = {
      current: await aavePool.getReserveData?.(tokenNetworkData.aave_token_contract_address),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Error on aavePoolGetReserveData', error);
    poolReserveDataRef[key] = {
      current: null,
      timestamp: 0,
    };
  }
  return poolReserveDataRef[key].current;
};

export const getVaquitaPoolData = async (networkData: Network, tokenNetworkData: TokenNetwork, lockPeriod: number, tempCache: any) => {
  try {
    const cacheKey = networkData.name;
    
    // Check cache first
    if (lastResponse[cacheKey] && Date.now() - lastResponse[cacheKey].timestamp <= ONE_HOUR) {
      // return {
      //   accessManagedMsv: lastResponse[cacheKey].accessManagedMsv,
      //   period: lastResponse[cacheKey].period,
      //   poolReserveData: lastResponse[cacheKey].poolReserveData,
      // };
    }
    
    if (tempCache[lockPeriod]) {
      return {
        accessManagedMsv: tempCache[lockPeriod].accessManagedMsv,
        rewardPool: tempCache[lockPeriod].rewardPool,
        totalDeposits: tempCache[lockPeriod].totalDeposits,
        totalShares: tempCache[lockPeriod].totalShares,
        poolReserveData: tempCache[lockPeriod].poolReserveData,
      };
    }
    
    const {
      rewardPool,
      totalDeposits,
      totalShares,
    } = await getVaquitaPoolPeriods(lockPeriod, networkData, tokenNetworkData);
    
    const vaquitaPoolAddress = firstElement(tokenNetworkData!.vaquita_contract_address);
    const vaquitaPool = networkData.name === 'Base' ? getBaseVaquitaContract(vaquitaPoolAddress) : getBaseSepoliaVaquitaContract(vaquitaPoolAddress);
    const accessManagedMSVAddress = await vaquitaPool?.accessManagedMSV?.();
    if (!accessManagedMSVAddress || !ethers.isAddress(accessManagedMSVAddress)) {
      console.error(`Invalid address returned: "${accessManagedMSVAddress}"`);
      return { accessManagedMsv: null, rewardPool: 0, totalDeposits: 0, totalShares: 0, poolReserveData: null };
    }
    
    const signer = networkData.name === 'Base' ? getBaseSigner() : getBaseSepoliaSigner();
    
    const accessManagedMsv = new ethers.Contract(
      accessManagedMSVAddress,
      accessManagedMsvAbi,
      signer,
    );
    
    const poolReserveData = await getCachedAaavePoolGetReserveData(networkData, tokenNetworkData);
    
    // Cache the response
    lastResponse[cacheKey] = {
      timestamp: Date.now(),
      accessManagedMsv,
      rewardPool,
      totalDeposits,
      totalShares,
      poolReserveData,
    };
    
    tempCache[lockPeriod] = {
      accessManagedMsv,
      rewardPool,
      totalDeposits,
      totalShares,
      poolReserveData,
    };
    
    return { accessManagedMsv, rewardPool, totalDeposits, totalShares, poolReserveData };
  } catch (error) {
    console.error('Error on getVaquitaPoolData', error);
    return { accessManagedMsv: null, rewardPool: 0, totalDeposits: 0, totalShares: 0, poolReserveData: null };
  }
};

export const getDepositVaquitaPoolPositions = async (provider: ethers.JsonRpcProvider, vaquitaContract: string, depositIdHex: string) => {
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    const vaquitaPool = new ethers.Contract(vaquitaContract, VaquitaPoolAbi, signer);
    return await vaquitaPool.positions?.(depositIdHex);
  } catch (error) {
    console.error('Error on getDepositVaquitaPoolPositions', error);
    return null;
  }
};

export const checkVaquitaPoolDepositData = async (deposits: DepositWithState[], networkData: Network, tokenNetworkData: TokenNetwork) => {
  try {
    const rpcUrl = networkData.name === 'Base' ? process.env.BASE_MAINNET_RPC_URL : 'https://sepolia.base.org';
    
    const vaquitaPoolAddress = tokenNetworkData!.vaquita_contract_address;
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    const vaquitaPool = new ethers.Contract(vaquitaPoolAddress, VaquitaPoolAbi, signer);
    
    for (const { id, deposit_id_hex, wallet_address, amount, lock_period } of deposits) {
      try {
        if (deposit_id_hex) {
          const depositData = await vaquitaPool.positions?.(deposit_id_hex);
          const walletAddress = depositData[0];
          if (wallet_address !== walletAddress) {
            if (!wallet_address || walletAddress !== '0x0000000000000000000000000000000000000000') {
              await _updateDeposit(id, { wallet_address: walletAddress });
              console.info(`DIFF (${id}), wallet_address "${wallet_address}" "${depositData[0]}" FIXED`);
            } else {
              console.info(`DIFF (${id}), wallet_address "${wallet_address}" "${depositData[0]}"`);
            }
          }
          const amountD = Number(depositData[1]) / (10 ** tokenNetworkData.token_decimals);
          if (+amount !== amountD) {
            console.info(`DIFF (${id}), amount "${amount}" "${amountD}"`);
          }
          const lockPeriod = Number(depositData[4]) * 1000;
          if (+lock_period !== lockPeriod) {
            if (!lock_period) {
              await _updateDeposit(id, { lock_period: lockPeriod });
              console.info(`DIFF (${id}), lock_period "${lock_period}" "${lockPeriod}" FIXED`);
            } else {
              console.info(`DIFF (${id}), lock_period "${lock_period}" "${lockPeriod}" NO FIXED`);
            }
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(error);
      }
    }
  } catch (error) {
    console.error('Error on checkVaquitaPoolDepositData', error);
  }
};
