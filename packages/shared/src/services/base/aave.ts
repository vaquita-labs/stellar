import type { Reserve } from '@blend-capital/blend-sdk';
import { formatUnits, Interface } from 'ethers';
import { VaquitaPoolAbi } from '../../abi/vaquitaPoolAbi';
import { ONE_DAY } from '../../config/constants';
import { getTokenNetworkByNetworkIdTokenId } from '../network';
import { getPeriodData } from '../stellar/stellar-sdk';
import type { Deposit, Network, TokenNetwork } from '../../types';
import { getCachedAaavePoolGetReserveData } from './pool';
import { getVaquitaPoolPeriods } from './vaquita';

const EMPTY = { aaveInterest: 0, vaquitaInterest: 0 };
const SECONDS_PER_YEAR = 31536000;

// let lastRequest: { [key: string]: { timestamp: number, aaveInterest: number, vaquitaInterest: number } } = {};

export const getBaseInterest = async (network: Network, deposit: Deposit, tokenNetworkData: TokenNetwork) => {
  try {
    if (!deposit.deposit_id_hex) {
      return EMPTY;
    }
    // if (!lastRequest[deposit.deposit_id_hex]) {
    //   lastRequest[deposit.deposit_id_hex] = {
    //     timestamp: 0,
    //     aaveInterest: 0,
    //     vaquitaInterest: 0,
    //   };
    // }
    // if (Date.now() - lastRequest[deposit.deposit_id_hex]!.timestamp <= ONE_HOUR) {
    //   return {
    //     aaveInterest: lastRequest[deposit.deposit_id_hex]!.aaveInterest,
    //     vaquitaInterest: lastRequest[deposit.deposit_id_hex]!.vaquitaInterest,
    //   };
    // }
    
    const iface = new Interface(VaquitaPoolAbi);
    const decodedLog = iface.parseLog(JSON.parse(deposit.transaction_event_raw));
    // const shares = BigInt(decodedLog?.args.shares);
    const depositAmount = BigInt(decodedLog?.args?.amount || 0);
    // const positionValue = await accessManagedMsv.previewRedeem?.(shares);
    const {
      protocolApy,
      vaquitaApy,
    } = await getBaseApyData(network, tokenNetworkData, deposit.lock_period);
    const aaveInterestBigInt = Number(depositAmount) * deposit.lock_period * (protocolApy / (100 * (SECONDS_PER_YEAR * 1000)));
    const vaquitaInterestBigInt = Number(depositAmount) * deposit.lock_period * (vaquitaApy / (100 * (SECONDS_PER_YEAR * 1000)));
    
    const base = 10 ** tokenNetworkData.token_decimals;
    console.info({
      // positionValue,
      depositIdHex: deposit.deposit_id_hex,
      aaveInterestBigInt,
      vaquitaInterestBigInt,
      depositAmount: Number(depositAmount) / base,
      // period,
      'aave interest': Number(aaveInterestBigInt) / base,
      'vaquita interest': Number(vaquitaInterestBigInt) / base,
      'vaquita apy': vaquitaApy + '%',
    });
    const aaveInterest = Number(aaveInterestBigInt) / base;
    const vaquitaInterest = Number(vaquitaInterestBigInt) / base;
    // lastRequest[deposit.deposit_id_hex] = {
    //   timestamp: Date.now(),
    //   aaveInterest,
    //   vaquitaInterest,
    // };
    return {
      aaveInterest,
      vaquitaInterest,
    };
  } catch (error) {
    console.error('Error on getProtocolInterest', error);
    return EMPTY;
  }
};

export const VAQUITA_APY_DUMMY = {
  [ONE_DAY * 7]: 10,
  [ONE_DAY * 30 * 3]: 25,
  [ONE_DAY * 30 * 6]: 40,
};

export const PROTOCOL_APY_DUMMY = 5;

export const getBaseApyData = async (networkData: Network, tokenNetworkData: TokenNetwork, lockPeriodMs: number) => {
  
  const {
    rewardPool,
    totalDeposits,
    totalShares,
  } = await getVaquitaPoolPeriods(lockPeriodMs, networkData, tokenNetworkData);
  
  const poolReserveData = await getCachedAaavePoolGetReserveData(networkData, tokenNetworkData);
  if (!poolReserveData?.currentLiquidityRate) {
    return {
      rewardPool,
      totalDeposits,
      totalShares,
      protocolApy: 0,
      vaquitaApy: 0,
      lendingMarketName: 'Aave',
    };
  }
  
  const lockPeriodInMonths = lockPeriodMs / (ONE_DAY * 30);
  
  console.info('getProtocolApy', { totalDeposits, rewardPool, lockPeriodInMonths });
  const vaquitaApy = totalDeposits > 0 ? ((Number(rewardPool) * 100 * 12) / (Number(totalDeposits) * lockPeriodInMonths)) : 0;
  const liquidityRateBN = poolReserveData?.currentLiquidityRate;
  const aprStr = formatUnits(liquidityRateBN, 27);
  const apr = Number(aprStr);
  const perSecond = apr / SECONDS_PER_YEAR;
  const protocolApy = (Math.pow(1 + perSecond, SECONDS_PER_YEAR) - 1) * 100;
  
  return {
    rewardPool,
    totalDeposits,
    totalShares,
    protocolApy,
    vaquitaApy,
    lendingMarketName: 'Aave',
  };
};

export const getDummyApyData = (lockPeriodMs: number) => {
  return {
    protocolApy: PROTOCOL_APY_DUMMY,
    vaquitaApy: VAQUITA_APY_DUMMY[lockPeriodMs] ?? 0,
    lendingMarketName: 'Aave',
  };
};

export const getStellarApyData = async (network: Network, lockPeriodMs: number, poolData: Reserve | null) => {
  const empty = { protocolApy: 0, vaquitaApy: 0, lendingMarketName: '' };
  try {
    const networkId = network.name === 'Stellar Testnet' ? 9 : 2;
    const tokenId = 7;
    const { data: tokenNetworkData } = await getTokenNetworkByNetworkIdTokenId(networkId, tokenId);
    const periodData = await getPeriodData(lockPeriodMs, tokenNetworkData?.vaquita_contract_address!);
    const lockPeriodInMonths = lockPeriodMs / (ONE_DAY * 30);
    const base = 10 ** 7;
    const protocolApr = poolData?.data.bRate ? (Number(poolData.data.bRate) / Number(poolData.data.dRate)) : 0;
    const protocolApy = (Math.pow(1 + protocolApr / 100, 12) - 1) * 100;
    const vaquitaApy = periodData.totalDeposits > 0 ? ((Number(periodData.rewardPool) / Number(periodData.totalDeposits)) * 100 * 12) / (lockPeriodInMonths * base) : 0;
    return {
      protocolApy,
      vaquitaApy,
      lendingMarketName: 'Blend',
    };
  } catch (error) {
    console.error('Error on getProtocolApy', error);
    return empty;
  }
};
