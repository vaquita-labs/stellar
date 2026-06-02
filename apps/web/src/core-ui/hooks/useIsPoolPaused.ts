import { getIsPoolPaused } from '@/networks/stellar/poolQueries';
import { useQuery } from '@tanstack/react-query';
import { useConfigStore } from '../stores';

const POLL_INTERVAL_MS = 60_000; // re-check every 60 s

/**
 * Returns whether the currently-selected Stellar pool is paused.
 * Falls back to `false` (unpaused) on any network error so the UI degrades gracefully.
 * Only queries when `token.vaquitaContractAddress` is available.
 */
export function useIsPoolPaused(): { isPaused: boolean; isLoading: boolean } {
  const { token } = useConfigStore();
  const contractId = token?.vaquitaContractAddress ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['pool-paused', contractId],
    queryFn: () => getIsPoolPaused(contractId),
    enabled: Boolean(contractId),
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS,
  });

  return { isPaused: data ?? false, isLoading };
}
