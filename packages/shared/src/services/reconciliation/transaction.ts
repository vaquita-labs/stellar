import { rpc, scValToNative, StrKey, xdr } from '@stellar/stellar-sdk';
import { prisma } from '@vaquita/db';

import { resolveSorobanNetwork, type SorobanCallOptions } from '../stellar/rpc';
import { createPrismaReconciliationDependencies, runReconciliation } from './index';
import type { RawReconciliationEvent } from './types';

/**
 * Repairing a withdrawal row from a single transaction hash.
 *
 * The scheduled reconciler is the system of record for this repair, but it runs
 * on a cursor and an hourly schedule, so a position orphaned by a closed tab
 * stays wrong until the next pass. This is the same repair reached from the
 * other side: a client notices its own rows disagree with the chain, finds the
 * transaction that moved them, and hands over the hash.
 *
 * A hash is a claim, not a fact — nothing stops a caller from posting any hash
 * it likes — so nothing but the hash is taken from the request. The transaction
 * is re-read from the RPC and every field that reaches the database comes out of
 * the ledger's own meta: the deposit id, the amounts, the close time. A caller
 * that invents a hash gets NOT_FOUND; one that posts a hash that touched no pool
 * matches no deposit row and changes nothing; one that posts somebody else's
 * real hash repairs that row exactly as the scheduled job would have.
 *
 * The decoded events go through the reconciler's own parser, matcher and apply
 * step, so a repair from here is the repair the scheduled job would have made.
 * The cursor is never advanced: one transaction says nothing about how far the
 * scan has read.
 */
export interface TransactionReconcileOutcome {
  txHash: string;
  /** SUCCESS only when the chain confirms it; nothing is written otherwise. */
  verdict: 'SUCCESS' | 'FAILED' | 'NOT_FOUND' | 'UNREADABLE';
  /** Pool withdraw events found in the transaction. */
  poolEvents: number;
  /** Withdrawals written. Zero on a dry run, and zero when nothing was wrong. */
  appliedWithdrawalRepairs: number;
  /** What the matcher decided to do, whether or not it was written. */
  plannedWithdrawalRepairs: number;
  /** Events the matcher refused to act on; each one is a row worth a look. */
  ambiguousEvents: number;
}

export interface TransactionReconcileOptions extends SorobanCallOptions {
  /** Pool contracts to accept events from. Anything else in the tx is ignored. */
  contractIds: string[];
  /** Plan the repair and report it without writing. Verification only. */
  dryRun?: boolean;
}

/**
 * Only withdrawals are repaired from a single hash.
 *
 * A deposit row is created before its transaction is signed and carries a
 * placeholder id until the confirm call fills the real one in, so the matcher
 * cannot recognise an unconfirmed deposit row from its event and would plan a
 * second row beside it. The scheduled reconciler makes that call with the whole
 * ledger range in view; one hash posted by a browser is not the place for it.
 */
const RECONCILABLE_EVENTS = new Set(['withdraw']);

/**
 * The contract events a transaction emitted, flattened across its operations.
 *
 * Read from the RPC's pre-parsed `contractEventsXdr` rather than walking the
 * transaction meta by hand: the meta union has changed shape across protocol
 * versions — mainnet is on v4 today — and reaching into `.v3()` throws outright
 * on the current one.
 */
const contractEventsOf = (transaction: unknown): xdr.ContractEvent[] => {
  const events = (transaction as { events?: { contractEventsXdr?: xdr.ContractEvent[][] } }).events;
  return (events?.contractEventsXdr ?? []).flat();
};

/**
 * Turn one transaction's pool withdraw events into the shape the parser reads.
 *
 * Topics and values are handed over as base64 XDR, which is one of the forms the
 * parser already decodes, so no field is interpreted twice here — this decides
 * only which events belong to a pool.
 */
const poolEventsFrom = (
  transaction: unknown,
  txHash: string,
  contractIds: string[],
): RawReconciliationEvent[] => {
  const ledger = Number((transaction as { ledger?: number }).ledger ?? 0);
  const createdAt = Number((transaction as { createdAt?: number | string }).createdAt ?? 0);
  const ledgerClosedAt = createdAt > 0 ? new Date(createdAt * 1000).toISOString() : undefined;
  const pools = new Set(contractIds);

  const out: RawReconciliationEvent[] = [];
  contractEventsOf(transaction).forEach((event, index) => {
    const contractIdBytes = event.contractId();
    if (!contractIdBytes) return;
    // xdr.Hash is a Buffer at runtime; its declared type is the opaque array.
    const contractId = StrKey.encodeContract(contractIdBytes as unknown as Buffer);
    if (!pools.has(contractId)) return;

    const body = event.body().v0();
    const topics = body.topics();
    let eventName: unknown;
    try {
      eventName = topics[0] ? scValToNative(topics[0]) : null;
    } catch {
      return;
    }
    if (typeof eventName !== 'string' || !RECONCILABLE_EVENTS.has(eventName)) return;

    out.push({
      id: `${txHash}-${index}`,
      ledger,
      txHash,
      contractId,
      topic: topics.map((topic) => topic.toXDR('base64')),
      value: body.data().toXDR('base64'),
      ...(ledgerClosedAt ? { ledgerClosedAt } : {}),
    });
  });
  return out;
};

/**
 * Repair whatever rows `txHash` moved on chain. Writes nothing unless the
 * transaction succeeded and carries a pool event.
 */
export const reconcileFromTransaction = async (
  txHash: string,
  options: TransactionReconcileOptions,
): Promise<TransactionReconcileOutcome> => {
  const base = {
    txHash,
    poolEvents: 0,
    appliedWithdrawalRepairs: 0,
    plannedWithdrawalRepairs: 0,
    ambiguousEvents: 0,
  };
  const rpcUrl = options.rpcUrl ?? resolveSorobanNetwork().rpcUrl;

  let transaction: rpc.Api.GetTransactionResponse;
  try {
    transaction = await new rpc.Server(rpcUrl).getTransaction(txHash);
  } catch (error) {
    console.error('[reconcileFromTransaction] getTransaction', error, { txHash });
    return { ...base, verdict: 'UNREADABLE' };
  }

  if (transaction.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    // FAILED and NOT_FOUND both mean "do not write", but they are different
    // answers: one the chain rejected, the other it has never seen or no longer
    // retains. Keep them apart so the caller can tell "retry later" from "stop".
    const verdict = transaction.status === rpc.Api.GetTransactionStatus.FAILED ? 'FAILED' : 'NOT_FOUND';
    return { ...base, verdict };
  }

  const events = poolEventsFrom(transaction, txHash, options.contractIds);
  if (events.length === 0) return { ...base, verdict: 'SUCCESS' };

  const ledger = Number((transaction as { ledger?: number }).ledger ?? 0);
  const result = await runReconciliation(
    {
      job: 'transaction-reconcile',
      contractIds: options.contractIds,
      startLedger: ledger,
      endLedger: ledger,
      dryRun: options.dryRun ?? false,
      advanceCursor: false,
    },
    { ...createPrismaReconciliationDependencies(prisma), fetchEvents: async () => events },
  );

  return {
    txHash,
    verdict: 'SUCCESS',
    poolEvents: events.length,
    appliedWithdrawalRepairs: result.counts.appliedWithdrawalRepairs,
    plannedWithdrawalRepairs: result.counts.plannedWithdrawalRepairs,
    ambiguousEvents: result.counts.ambiguousEvents,
  };
};

/** Pool contract addresses the platform currently recognises. */
export const listPoolContractIds = async (): Promise<string[]> => {
  const tokens = await prisma.token.findMany({
    where: { deletedAt: null, vaquitaContractAddress: { not: null } },
    select: { vaquitaContractAddress: true },
  });
  return [...new Set(tokens.map((token) => token.vaquitaContractAddress).filter((id): id is string => !!id))];
};
