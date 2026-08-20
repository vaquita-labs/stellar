import { ONE_DAY } from '../../config/constants';
import { apiServicesEnv } from '../../config/apiServicesEnv';
import { cached, firstElement } from '../../helpers';
import type { Network, TokenNetwork } from '../../types';
import { fetchDefindexVaultApy, stellarNetworkNameToDefindexHttpNetwork } from './defindexApy';
import { getPeriodData } from './stellar-sdk';

const SECONDS_PER_MONTH_30D = 60 * 60 * 24 * 30;

/**
 * The vault APY is a 7-day annualised figure, so it barely moves minute to
 * minute; ten minutes of staleness is invisible to users and keeps this well
 * clear of DeFindex's rate limit. A failed lookup is retried far sooner so a
 * transient error does not linger.
 */
const VAULT_APY_TTL_MS = 10 * 60 * 1000;
const VAULT_APY_NEGATIVE_TTL_MS = 30 * 1000;

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

/** The vault's own rate, with the market named only once a rate came back. */
export type VaultApyPayload = {
  protocolApy: number;
  lendingMarketName: string;
};

/**
 * The DeFindex vault's APY for this token.
 *
 * One vault backs both sides of the product — the pool forwards locked funds into
 * it, and the flexible balance is supplied to it directly — so this single rate
 * describes both, and the per-term payload and the flexible position read it from
 * here rather than each deriving their own.
 *
 * Returns 0 with no market name when the vault is unset or the lookup fails, so a
 * failed read is never presented as a real rate.
 *
 * Cached per vault for `VAULT_APY_TTL_MS`, shared across both callers and
 * deduplicated across concurrent requests, so the DeFindex API sees roughly one
 * call per vault per TTL regardless of traffic. While DeFindex is failing the
 * last known rate is served rather than 0 — though only for as long as this
 * process lives, since the cache is in-memory.
 */
export const getVaultApy = async (network: Network, tokenNetworkData: TokenNetwork): Promise<VaultApyPayload> => {
  const empty: VaultApyPayload = { protocolApy: 0, lendingMarketName: '' };
  const defindexNet = stellarNetworkNameToDefindexHttpNetwork(network.name);
  const vaultAddress = firstElement(tokenNetworkData.defindex_vault_contract_address ?? '')?.trim() || '';
  if (!vaultAddress || !defindexNet) return empty;

  const apy = await cached(
    `defindex:apy:${defindexNet}:${vaultAddress}`,
    () =>
      fetchDefindexVaultApy({
        host: apiServicesEnv.DEFINDEX_API_HOST,
        apiKey: apiServicesEnv.DEFINDEX_API_KEY,
        vaultAddress,
        network: defindexNet,
      }),
    { ttlMs: VAULT_APY_TTL_MS, negativeTtlMs: VAULT_APY_NEGATIVE_TTL_MS },
  );
  return apy != null ? { protocolApy: apy, lendingMarketName: 'DeFindex' } : empty;
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
    // No per-network branch here: `getPeriodData` defaults to the active network
    // (STELLAR_NETWORK), the same source every other on-chain read uses.
    const periodData = poolAddr
      ? await getPeriodData(lockPeriodMs, poolAddr)
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

    // Same vault the flexible position sits in, so both read the one rate.
    const { protocolApy, lendingMarketName } = await getVaultApy(network, tokenNetworkData);

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
