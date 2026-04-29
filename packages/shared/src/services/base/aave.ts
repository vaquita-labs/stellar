import type { Reserve } from '@blend-capital/blend-sdk';
import { Networks } from '@stellar/stellar-sdk';
import { formatUnits, Interface } from 'ethers';
import { VaquitaPoolAbi } from '../../abi/vaquitaPoolAbi';
import { ONE_DAY } from '../../config/constants';
import { firstElement } from '../../helpers';
import type { Deposit, Network, TokenNetwork } from '../../types';
import { fetchDefindexVaultApy, stellarNetworkNameToDefindexHttpNetwork } from '../stellar/defindexApy';
import { DEFAULT_STELLAR_MAINNET_SOROBAN_RPC, getPeriodData } from '../stellar/stellar-sdk';
import { getCachedAaavePoolGetReserveData } from './pool';
import { getVaquitaPoolPeriods } from './vaquita';

const EMPTY = { aaveInterest: 0, vaquitaInterest: 0 };
const SECONDS_PER_YEAR = 31536000;
const SECONDS_PER_MONTH_30D = 60 * 60 * 24 * 30;

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

/** Stellar APY endpoint payload; `interestModelNote` clarifies this is not per-deposit NAV math. */
export type StellarApyDisplayPayload = {
  rewardPool: number;
  totalDeposits: number;
  totalShares: number;
  protocolApy: number;
  vaquitaApy: number;
  lendingMarketName: string;
};

export const getStellarApyData = async (
  network: Network,
  lockPeriodMs: number,
  poolData: Reserve | null,
  tokenNetworkData: TokenNetwork,
): Promise<StellarApyDisplayPayload> => {
  const empty: StellarApyDisplayPayload = {
    rewardPool: 0,
    totalDeposits: 0,
    totalShares: 0,
    protocolApy: 0,
    vaquitaApy: 0,
    lendingMarketName: '',
  };
  try {
    const lockPeriodSeconds = lockPeriodMs >= 1_000_000 ? Math.trunc(lockPeriodMs / 1000) : Math.trunc(lockPeriodMs);
    const poolAddr = firstElement(tokenNetworkData.vaquita_contract_address ?? '');
    const periodOpts =
      network.name === 'Stellar'
        ? {
            rpcUrl: process.env.STELLAR_MAINNET_SOROBAN_RPC || DEFAULT_STELLAR_MAINNET_SOROBAN_RPC,
            networkPassphrase: Networks.PUBLIC,
          }
        : undefined;

    const periodData = poolAddr
      ? await getPeriodData(lockPeriodMs, poolAddr, periodOpts)
      : { rewardPool: '0', totalDeposits: '0', totalShares: '0' };
    const lockPeriodInMonths = lockPeriodSeconds / SECONDS_PER_MONTH_30D;
    const base = 10 ** 7;
    const totalDepositsRaw = Number(periodData.totalDeposits);
    const totalSharesRaw = Number(periodData.totalShares);
    const rewardPool = Number(periodData.rewardPool) / base;
    const totalDeposits = totalDepositsRaw / base;
    // Vaquita `Period` currently stores reward_pool + total_deposits only.
    // For backward-compatible API shape, fallback to raw total_deposits as proxy shares.
    const totalShares = totalSharesRaw > 0 ? totalSharesRaw : totalDepositsRaw;
    const vaquitaApy =
      periodData.totalDeposits !== '0' && Number(periodData.totalDeposits) > 0
        ? ((Number(periodData.rewardPool) / Number(periodData.totalDeposits)) * 100 * 12) /
          (lockPeriodInMonths * base)
        : 0;

    const defindexNet = stellarNetworkNameToDefindexHttpNetwork(network.name);
    const host = process.env.DEFINDEX_API_HOST?.trim();
    const apiKey = process.env.DEFINDEX_API_KEY?.trim();
    const vaultAddress =
      firstElement(tokenNetworkData.defindex_vault_contract_address ?? '')?.trim() ||
      process.env.STELLAR_DEFINDEX_VAULT_CONTRACT?.trim() ||
      '';

    let protocolApy = 0;
    let lendingMarketName = 'Blend';

    if (host && apiKey && vaultAddress && defindexNet) {
      const apy = await fetchDefindexVaultApy({ host, apiKey, vaultAddress, network: defindexNet });
      if (apy != null) {
        protocolApy = apy;
        lendingMarketName = 'DeFindex';
      }
    }

    if (protocolApy === 0 && poolData?.data?.bRate && poolData?.data?.dRate) {
      const protocolApr = Number(poolData.data.bRate) / Number(poolData.data.dRate);
      protocolApy = (Math.pow(1 + protocolApr / 100, 12) - 1) * 100;
      lendingMarketName = 'Blend';
    }

    return {
      rewardPool,
      totalDeposits,
      totalShares,
      protocolApy,
      vaquitaApy,
      lendingMarketName,
    };
  } catch (error) {
    console.error('Error on getProtocolApy', error);
    return empty;
  }
};
