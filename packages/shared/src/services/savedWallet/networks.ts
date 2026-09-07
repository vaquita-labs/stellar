/**
 * Networks a saved payout wallet may target.
 *
 * These exact strings are PERSISTED in `saved_wallets.network`, so the list is a
 * migration surface, not a preference: renaming a key orphans existing rows.
 * It used to be derived from the CCTP bridge's network table; the bridge is gone
 * and the values stayed, because the rows that reference them did.
 */
export const SUPPORTED_PAYOUT_NETWORKS = [
  'ethereum',
  'ethereum-sepolia',
  'base',
  'base-sepolia',
  'stellar',
  'stellar-testnet',
] as const;

export type SupportedPayoutNetwork = (typeof SUPPORTED_PAYOUT_NETWORKS)[number];

export const isSupportedPayoutNetwork = (value: string): value is SupportedPayoutNetwork =>
  (SUPPORTED_PAYOUT_NETWORKS as readonly string[]).includes(value);
