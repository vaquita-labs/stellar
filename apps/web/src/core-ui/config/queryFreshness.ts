/**
 * Freshness presets for queries that the app cannot keep up to date on its own.
 *
 * The global client (see `Providers`) holds every query fresh for a day and
 * turns off automatic refetching, so screens paint instantly from the persisted
 * cache. That is the right default for data the app itself owns: the shop
 * catalog, map objects, badges and achievements only move when this session
 * moves them, and the mutation that moves them invalidates its key.
 *
 * Balances, transactions, notifications and rankings move somewhere else: on
 * another device, in a settled payment, in a friend's activity. Without an
 * override they can sit a full day behind, because the realtime channels are
 * the only refresh path and they only reach a tab that was open and connected
 * at that exact moment. Spreading one of these presets opts a query back into
 * revalidating on mount, on focus and on reconnect.
 *
 * Both keep the persisted value on screen while the refetch runs, so the
 * revalidation is invisible: no spinner, no flash of an empty state.
 */
export const VOLATILE_QUERY_OPTIONS = {
  staleTime: 60_000,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;

/**
 * For values that must never be served stale, even for a minute: money that is
 * in flight and its resulting balances.
 */
export const LIVE_QUERY_OPTIONS = {
  ...VOLATILE_QUERY_OPTIONS,
  staleTime: 0,
} as const;
