'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { authFetch } from '@/networks/stellar/walletSession';

/**
 * Reports a flexible-savings movement to the server's ledger.
 *
 * A flexible deposit is a direct user → vault call, so the server never sees it
 * happen. This POST is the only record there will ever be: Soroban RPC keeps
 * about a week of events and the vault exposes a share balance rather than a
 * list of positions, so a movement that is not reported here cannot be
 * recovered or reconstructed later by anything.
 *
 * Best-effort all the same, following the rule `offrampApi.ts` states in its
 * header: a bookkeeping failure must NEVER tear down a transaction the chain
 * already accepted. So this retries a couple of times and then gives up
 * quietly. The cost of giving up is real — the user loses coins and badge
 * progress, not just a row in a dashboard — which is why it retries at all
 * rather than firing once.
 */

const base = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/vault-flows`;

/**
 * Whether the money crossed Vaquita's boundary or only moved between its own
 * two savings products.
 *
 * Getting this wrong is not cosmetic. An internal move recorded as external
 * inflates total volume by an amount the user never added, and pays them coins
 * for shuffling their own money sideways.
 */
export type VaultDepositFlowKind = 'external_in' | 'internal_in';
export type VaultWithdrawFlowKind = 'external_out' | 'internal_out';
export type VaultFlowKind = VaultDepositFlowKind | VaultWithdrawFlowKind;

export interface RecordVaultFlowInput {
  flowKind: VaultFlowKind;
  /** Human units (USDC), as a decimal string. */
  amount: string;
  transactionHash: string;
  tokenSymbol?: string;
}

/** Two extra tries, backing off, before the row is lost for good. */
const RETRY_DELAYS_MS = [1_000, 4_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Record one movement. Returns whether the server has it.
 *
 * Retrying is safe: the server keys the row on the transaction hash, so a
 * duplicate POST returns success without writing a second row or paying a
 * second time. A 4xx is the client's own fault and never worth repeating —
 * only a network failure or a 5xx gets another attempt.
 */
export async function recordVaultFlow(walletAddress: string, input: RecordVaultFlowInput): Promise<boolean> {
  const amount = Number(input.amount);
  // A zero amount is a caller bug, not a movement; the server's CHECK would
  // reject it anyway and the retry loop would burn two more requests on it.
  if (!Number.isFinite(amount) || amount <= 0) return false;

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
        console.warn('[vaultFlows] server rejected the flow:', response.status);
        return false;
      }
    } catch (err) {
      console.warn('[vaultFlows] could not report the flow:', err);
    }

    if (attempt >= RETRY_DELAYS_MS.length) return false;
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

/**
 * Record without making the caller wait, and without letting a rejection escape.
 *
 * Every call site is on the success path of a transaction that already landed,
 * so there is nothing useful for the UI to do with the outcome and nothing it
 * should stall on.
 */
export function recordVaultFlowInBackground(walletAddress: string, input: RecordVaultFlowInput): void {
  void recordVaultFlow(walletAddress, input).catch(() => false);
}
