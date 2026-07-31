import { rpc } from '@stellar/stellar-sdk';
import { resolveSorobanNetwork, type SorobanCallOptions } from './rpc';

/**
 * What the chain says about a submitted hash.
 *
 * `NOT_FOUND` is genuinely ambiguous — the transaction may not be in a ledger
 * yet, or it may have fallen out of the RPC's retention window — so it is kept
 * distinct from `FAILED` instead of being folded into it. `UNREADABLE` means we
 * never got an answer at all (RPC down), which is not evidence of anything.
 */
export type TxVerdict = 'SUCCESS' | 'FAILED' | 'NOT_FOUND' | 'UNREADABLE';

export type VerifyTxOptions = SorobanCallOptions & {
  /** How many times to ask before settling on NOT_FOUND. */
  maxPolls?: number;
  /** Delay between attempts, in ms. */
  intervalMs?: number;
};

const DEFAULT_MAX_POLLS = 4;
const DEFAULT_INTERVAL_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Single read of a hash's on-chain status. */
export async function getTxVerdict(hash: string, options?: SorobanCallOptions): Promise<TxVerdict> {
  if (!hash) return 'NOT_FOUND';
  try {
    const rpcUrl = options?.rpcUrl ?? resolveSorobanNetwork().rpcUrl;
    const result = await new rpc.Server(rpcUrl).getTransaction(hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return 'SUCCESS';
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) return 'FAILED';
    return 'NOT_FOUND';
  } catch (error) {
    console.error('[txStatus] getTxVerdict', error, { hash });
    return 'UNREADABLE';
  }
}

/**
 * Ask the chain whether `hash` landed, retrying while the answer is "not yet".
 *
 * A client reporting its own transaction as successful is a claim, not a fact:
 * the wallet SDK returns a hash for a transaction that was merely accepted for
 * submission, and nothing stops a caller from posting a hash of its own choosing.
 * Endpoints that hand out money, positions or rewards resolve that claim here.
 *
 * Retries only help the ambiguous verdicts: `SUCCESS` and `FAILED` are final and
 * return immediately.
 */
export async function verifyTxSucceeded(hash: string, options: VerifyTxOptions = {}): Promise<TxVerdict> {
  const maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;

  let verdict: TxVerdict = 'NOT_FOUND';
  for (let i = 0; i < maxPolls; i += 1) {
    if (i > 0) await sleep(intervalMs);
    verdict = await getTxVerdict(hash, options);
    if (verdict === 'SUCCESS' || verdict === 'FAILED') return verdict;
  }
  return verdict;
}
