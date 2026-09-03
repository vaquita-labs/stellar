import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { VOLATILE_QUERY_OPTIONS } from '../config/queryFreshness';
import { useTranslation } from 'react-i18next';
import { isPassiveVaultEnabled } from '@/core-ui/config/featureFlags';
import { useConfigStore } from '@/core-ui/stores';
import { getStellarNetwork } from '@/networks/stellar/kit';
import { defindexVaultConfigForToken, getVaultPosition, type DefindexVaultPosition } from '@/networks/stellar/vaultQueries';
import { projectBlendUsdc, useBlendUsdc, useLiveBlendUsdc } from './useBlendPosition';
import { useLiveTick } from './useLiveTick';
import { useVaultApy } from './useVaultApy';

const EMPTY: DefindexVaultPosition = { shares: 0n, usdc: 0 };

/**
 * Reads the user's DeFindex vault position on-chain and live: the df-token
 * `balance` and the USDC it's worth. Vault + USDC come from the active token of
 * the project config (DB → API → store), same source as the Blend position.
 *
 * The vault is shared with the locked pool, but df-tokens are per-holder, so
 * `balance(userWallet)` is exactly this user's passive position and never touches
 * pool shares.
 *
 * Gated on the rollout flag as well as the vault config: while the flag is off
 * every consumer discards this position in favour of the Blend one, so running
 * the query would just be two RPC simulations per user per minute thrown away.
 *
 * Money-safety mirrors `useBlendPosition`: the balance must never flash to $0 or
 * dip on a transient RPC blip. `keepPreviousData` holds the last known value
 * during refetches, background refetch keeps it fresh without a spinner, and
 * `getVaultPosition` throws (rather than returning 0) on a simulation error so
 * these retries actually kick in instead of persisting a false zero.
 */
export const useDefindexVaultPosition = (walletAddress?: string) => {
  const token = useConfigStore((s) => s.token);
  const config = defindexVaultConfigForToken(token);

  return useQuery<DefindexVaultPosition>({
    queryKey: ['defindex-vault-position', getStellarNetwork(), config?.vaultId, walletAddress],
    queryFn: async () => {
      if (!walletAddress || !config) return EMPTY;
      return getVaultPosition(config, walletAddress);
    },
    enabled: isPassiveVaultEnabled() && !!walletAddress && !!config,
    // It's money: never a $0 flash mid-refetch, never a dip on an RPC blip.
    placeholderData: keepPreviousData,
    // Revalidates on mount, focus and reconnect, with 60s of grace so the RPC
    // stays calm. Invalidating this query after a deposit/withdraw still forces
    // an immediate refresh.
    ...VOLATILE_QUERY_OPTIONS,
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
};

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * `useDefindexVaultPosition` + the ingredients to PROJECT the balance live: the
 * on-chain snapshot (`settled`), how much it earns per millisecond (`ratePerMs`)
 * and since when (`updatedAt`, the fetch time).
 *
 * The rate is the VAULT's own APY (`useVaultApy`), not Blend's supply APY: the
 * vault takes a fee and runs its own strategy, so Blend's rate over-states this
 * position. It also has to be the vault's, because it drives the live projection
 * — projecting at a rate the settled balance does not actually grow at makes the
 * number climb between fetches and snap back on every refetch. A vault reporting
 * 0 therefore holds the balance still, which is what the money is doing.
 */
export const useVaultUsdc = (walletAddress?: string) => {
  const query = useDefindexVaultPosition(walletAddress);
  const vaultApy = useVaultApy();
  const settled = query.data?.usdc ?? 0;
  const apy = vaultApy.data?.protocolApy ?? 0;
  const ratePerMs = (settled * (apy / 100)) / MS_PER_YEAR;

  return { ...query, settled, apy, ratePerMs, updatedAt: query.dataUpdatedAt };
};

/**
 * Like `useVaultUsdc` but adds `live`: the vault balance PROJECTED in real time =
 * on-chain snapshot + estimated interest accrued since the last fetch, advancing
 * with the shared tick. On the next refetch (60s) the snapshot snaps to the real
 * value and the projection restarts from there. `keepPreviousData` on the
 * underlying query means an RPC blip holds the last settled value (no flash to $0,
 * no drop) and the projection keeps ticking from it. Re-renders ~4x/sec — safe in
 * a panel/sheet, not on the 3D map (see `useLiveTick`).
 */
export const useLiveVaultUsdc = (walletAddress?: string) => {
  const position = useVaultUsdc(walletAddress);
  const now = useLiveTick();

  return {
    ...position,
    live: projectBlendUsdc(position.settled, position.ratePerMs, position.updatedAt, now),
  };
};

/**
 * Is the passive/flexible balance currently sourced from the DeFindex vault? True
 * when the rollout flag is on AND the active token has a vault configured; false
 * means the legacy Blend position is the source. The single switch every
 * passive-balance surface reads, so they all agree.
 */
export const usePassiveVaultOn = (): boolean => {
  const token = useConfigStore((s) => s.token);
  return isPassiveVaultEnabled() && !!defindexVaultConfigForToken(token);
};

/**
 * The label for the flexible/passive position, flag-aware: "Vault · Flexible" when
 * funds live in the DeFindex vault, else the legacy "Blend · Flexible". One source
 * so every surface names it consistently.
 */
export const usePassiveLabel = (): string => {
  const { t } = useTranslation();
  return usePassiveVaultOn() ? t('portfolio.vault.label', 'Vault · Flexible') : t('portfolio.blend.label', 'Blend · Flexible');
};

/**
 * The passive/flexible position, from the vault when `usePassiveVaultOn` else from
 * Blend — normalized so every surface (header, portfolio, withdraw, off-ramp) reads
 * one shape and shows the SAME number. `usePassiveUsdc` is the non-live variant
 * (snapshot + ratePerMs for callers that project themselves); `useLivePassiveUsdc`
 * adds the ticking `live` value. Both sub-hooks run every render (react-query dedupes)
 * so the switch never violates the rules of hooks.
 */
export const usePassiveUsdc = (walletAddress?: string) => {
  const blend = useBlendUsdc(walletAddress);
  const vault = useVaultUsdc(walletAddress);
  const vaultOn = usePassiveVaultOn();
  const src = vaultOn ? vault : blend;
  return {
    settled: src.settled,
    apy: src.apy,
    ratePerMs: src.ratePerMs,
    updatedAt: src.updatedAt,
    usdc: src.data?.usdc ?? 0,
    data: src.data,
    isFetching: src.isFetching,
    isLoading: src.isLoading,
    isError: src.isError,
    error: src.error,
    refetch: src.refetch,
    vaultOn,
  };
};

export const useLivePassiveUsdc = (walletAddress?: string) => {
  const blend = useLiveBlendUsdc(walletAddress);
  const vault = useLiveVaultUsdc(walletAddress);
  const vaultOn = usePassiveVaultOn();
  const src = vaultOn ? vault : blend;
  return {
    live: src.live,
    settled: src.settled,
    apy: src.apy,
    ratePerMs: src.ratePerMs,
    updatedAt: src.updatedAt,
    usdc: src.data?.usdc ?? 0,
    data: src.data,
    isFetching: src.isFetching,
    isLoading: src.isLoading,
    isError: src.isError,
    error: src.error,
    refetch: src.refetch,
    vaultOn,
  };
};
