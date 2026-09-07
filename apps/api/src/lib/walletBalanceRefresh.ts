import type { Logger } from 'pino';
import { lazyRefreshWalletBalances } from '@vaquita/shared/services/wallets/onchainBalances';

/**
 * Refreshes a wallet's on-chain balance snapshot after its money moved, without
 * making the caller wait for it.
 *
 * Detached on purpose. The read is a sequential Soroban call against a
 * rate-limited public RPC (~1.7 s, and it can 429), and it is bookkeeping: a
 * deposit confirmation must not fail or stall because a balance read did. Same
 * shape as the fire-and-forget badge evaluation in `services/deposit`.
 *
 * `maxAgeMs: 0` because every call site here is an event that already means the
 * balance changed — the staleness gate exists for the passive callers, not for
 * these.
 */
export function refreshWalletBalanceAfterEvent(
  wallet: string | null | undefined,
  log: Logger,
  event: string,
): void {
  if (!wallet) return;
  void lazyRefreshWalletBalances(wallet, { maxAgeMs: 0 }).catch((err) => {
    log.warn({ err, wallet, event }, 'Failed to refresh wallet balances');
  });
}
