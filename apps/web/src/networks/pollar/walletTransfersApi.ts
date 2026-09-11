'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { authFetch } from '@/networks/stellar/walletSession';

/**
 * Reports a payment out of the user's wallet to the server's ledger.
 *
 * A sponsored USDC payment goes straight from the wallet to the destination, so
 * the server never sees it happen. This POST is the only record there will ever
 * be: Soroban RPC keeps about a week of events, so a payment that is not
 * reported here cannot be recovered or reconstructed later by anything.
 *
 * The same call serves both things the send sheet does — paying another Vaquita
 * user and moving money out to an outside address — because on chain they are
 * one operation. Which of the two it was is decided by the server, not here: it
 * resolves the destination against the profiles table at insert, and that answer
 * is what separates "changed hands inside the app" from "left the app" in every
 * total. See `apps/api/src/routes/wallet-transfers/route.ts`.
 *
 * Best-effort, following the rule `vaultFlowsApi.ts` and `offrampApi.ts` both
 * state in their headers: a bookkeeping failure must NEVER tear down a
 * transaction the chain already accepted. So this retries a couple of times and
 * then gives up quietly.
 */

const base = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/wallet-transfers`;

export interface RecordWalletTransferInput {
  /** Human units (USDC), as a decimal string. */
  amount: string;
  /** The resolved `G…` address. Never an `@handle` — handles are renameable. */
  destinationAddress: string;
  transactionHash: string;
  tokenSymbol?: string;
}

/** Two extra tries, backing off, before the row is lost for good. */
const RETRY_DELAYS_MS = [1_000, 4_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Record one payment. Returns whether the server has it.
 *
 * Retrying is safe: the server keys the row on the transaction hash, so a
 * duplicate POST returns success without writing a second row. A 4xx is the
 * client's own fault and never worth repeating — a self-send is refused that
 * way — so only a network failure or a 5xx gets another attempt.
 */
export async function recordWalletTransfer(walletAddress: string, input: RecordWalletTransferInput): Promise<boolean> {
  const amount = Number(input.amount);
  // A zero amount is a caller bug, not a movement; the server's CHECK would
  // reject it anyway and the retry loop would burn two more requests on it.
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (!input.destinationAddress || input.destinationAddress === walletAddress) return false;

  const body = JSON.stringify({ ...input, amount });

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await authFetch(
        base(),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
        walletAddress,
      );
      if (response.ok) return true;
      if (response.status < 500) {
        console.warn('[walletTransfers] server rejected the transfer:', response.status);
        return false;
      }
    } catch (err) {
      console.warn('[walletTransfers] could not report the transfer:', err);
    }

    if (attempt >= RETRY_DELAYS_MS.length) return false;
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

/**
 * Record without making the caller wait, and without letting a rejection escape.
 *
 * Every call site is on the success path of a payment that already landed, so
 * there is nothing useful for the UI to do with the outcome and nothing it
 * should stall on.
 */
export function recordWalletTransferInBackground(walletAddress: string, input: RecordWalletTransferInput): void {
  void recordWalletTransfer(walletAddress, input).catch(() => false);
}
