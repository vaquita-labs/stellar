import { Networks } from '@stellar/stellar-sdk';
import { ONE_DAY } from '../../config/constants';
import { apiServicesEnv } from '../../config/apiServicesEnv';
import { firstElement } from '../../helpers';
import type { Network, TokenNetwork } from '../../types';
import { fetchDefindexVaultApy, stellarNetworkNameToDefindexHttpNetwork } from './defindexApy';
import { requireSorobanRpcUrl } from './rpc';
import { getPeriodData } from './stellar-sdk';

const SECONDS_PER_MONTH_30D = 60 * 60 * 24 * 30;

export const VAQUITA_APY_DUMMY = {
  [ONE_DAY * 7]: 10,
  [ONE_DAY * 30 * 3]: 25,
  [ONE_DAY * 30 * 6]: 40,
};

export const PROTOCOL_APY_DUMMY = 5;

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
            rpcUrl: requireSorobanRpcUrl('mainnet'),
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
    // Ratio reward/deposit is unitless; do not divide by `base` here.
    const vaquitaApy =
      totalDeposits > 0 ? (rewardPool * 100 * 12) / (totalDeposits * lockPeriodInMonths) : 0;

    const defindexNet = stellarNetworkNameToDefindexHttpNetwork(network.name);
    const host = apiServicesEnv.DEFINDEX_API_HOST;
    const apiKey = apiServicesEnv.DEFINDEX_API_KEY;
    const vaultAddress =
      firstElement(tokenNetworkData.defindex_vault_contract_address ?? '')?.trim() || '';

    // Named only once a rate actually comes back. An empty name makes the UI fall
    // back to a generic "the lending protocol", so a failed lookup can never
    // present 0% as a real rate from a protocol that was never queried.
    let protocolApy = 0;
    let lendingMarketName = '';

    if (vaultAddress && defindexNet) {
      const apy = await fetchDefindexVaultApy({ host, apiKey, vaultAddress, network: defindexNet });
      if (apy != null) {
        protocolApy = apy;
        lendingMarketName = 'DeFindex';
      }
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
