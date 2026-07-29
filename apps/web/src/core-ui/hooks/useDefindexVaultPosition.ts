import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useConfigStore } from '@/core-ui/stores';
import { getStellarNetwork } from '@/networks/stellar/kit';
import {
  defindexVaultConfigForToken,
  getVaultPosition,
  type DefindexVaultPosition,
} from '@/networks/stellar/vaultQueries';

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
    enabled: !!walletAddress && !!config,
    // The position only changes on deposit/withdraw; 60s keeps the RPC calm.
    // After a deposit/withdraw, invalidating this query forces the refresh.
    staleTime: 60_000,
    // It's money: never a $0 flash mid-refetch, never a dip on an RPC blip.
    placeholderData: keepPreviousData,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
};
