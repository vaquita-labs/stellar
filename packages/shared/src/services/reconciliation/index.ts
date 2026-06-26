import type { Prisma } from '@vaquita/db';

import { DepositStatus, WithdrawalStatus } from '../../types';
import { matchReconciliationEvents } from './matcher';
import { parseVaquitaPoolEvents } from './parser';
import { normalizeReconciliationState, updateReconciliationState } from './state';
import type {
  NormalizedReconciliationEvent,
  RawReconciliationEvent,
  ReconciliationCounts,
  ReconciliationDepositRecord,
  ReconciliationRunInput,
  ReconciliationRunOutput,
  ReconciliationState,
  ReconciliationTokenRecord,
} from './types';

export * from './matcher';
export * from './parser';
export * from './range';
export * from './state';
export * from './types';

export interface ReconciliationDependencies {
  fetchEvents: (input: ReconciliationRunInput) => Promise<RawReconciliationEvent[]>;
  loadDeposits: (events: NormalizedReconciliationEvent[], contractIds: string[]) => Promise<ReconciliationDepositRecord[]>;
  loadTokens: (events: NormalizedReconciliationEvent[], contractIds: string[]) => Promise<ReconciliationTokenRecord[]>;
  loadState: () => Promise<ReconciliationState>;
  saveState: (state: ReconciliationState) => Promise<void>;
  applyDepositRepair: (repair: ReconciliationRunOutput['plannedDepositRepairs'][number]) => Promise<void>;
  applyWithdrawalRepair: (repair: ReconciliationRunOutput['plannedWithdrawalRepairs'][number]) => Promise<void>;
  now: () => Date;
}

const lastEvent = (events: NormalizedReconciliationEvent[]) =>
  [...events].sort((a, b) => a.ledger - b.ledger || a.eventId.localeCompare(b.eventId)).at(-1) ?? null;

const countsFor = (
  scannedEvents: number,
  parsedEvents: number,
  parseIssues: number,
  match: ReturnType<typeof matchReconciliationEvents>,
  appliedDepositRepairs: number,
  appliedWithdrawalRepairs: number,
): ReconciliationCounts => ({
  scannedEvents,
  parsedEvents,
  parseIssues,
  plannedDepositRepairs: match.plannedDepositRepairs.length,
  plannedWithdrawalRepairs: match.plannedWithdrawalRepairs.length,
  ambiguousEvents: match.ambiguousEvents.length,
  skippedEvents: match.skippedEvents.length,
  appliedDepositRepairs,
  appliedWithdrawalRepairs,
});

export const runReconciliation = async (
  input: ReconciliationRunInput,
  deps: ReconciliationDependencies,
): Promise<ReconciliationRunOutput> => {
  const cursorBefore = await deps.loadState();
  const rawEvents = await deps.fetchEvents(input);
  const { parsedEvents, parseIssues } = (() => {
    const { parsed, issues } = parseVaquitaPoolEvents(rawEvents);
    return { parsedEvents: parsed, parseIssues: issues };
  })();
  const [deposits, tokens] = await Promise.all([
    deps.loadDeposits(parsedEvents, input.contractIds),
    deps.loadTokens(parsedEvents, input.contractIds),
  ]);
  const match = matchReconciliationEvents(parsedEvents, deposits, tokens);

  let appliedDepositRepairs = 0;
  let appliedWithdrawalRepairs = 0;

  if (!input.dryRun) {
    for (const repair of match.plannedDepositRepairs) {
      await deps.applyDepositRepair(repair);
      appliedDepositRepairs += 1;
    }
    for (const repair of match.plannedWithdrawalRepairs) {
      await deps.applyWithdrawalRepair(repair);
      appliedWithdrawalRepairs += 1;
    }
  }

  const counts = countsFor(
    rawEvents.length,
    parsedEvents.length,
    parseIssues.length,
    match,
    appliedDepositRepairs,
    appliedWithdrawalRepairs,
  );
  const newest = lastEvent(parsedEvents);
  const runAt = deps.now().toISOString();
  const hasAmbiguousEvents = match.ambiguousEvents.length > 0;
  const shouldAdvance = !input.dryRun && input.advanceCursor && !hasAmbiguousEvents;
  const shouldRecordBlocked = !input.dryRun && input.advanceCursor && hasAmbiguousEvents;
  const cursorAfter = shouldAdvance
    ? updateReconciliationState(cursorBefore, input.job, input.contractIds, {
        lastProcessedLedger: newest?.ledger ?? input.endLedger,
        lastProcessedEventId: newest?.eventId ?? null,
        runAt,
        success: true,
        errorSummary: null,
        counts,
      })
    : shouldRecordBlocked
      ? updateReconciliationState(cursorBefore, input.job, input.contractIds, {
          lastProcessedLedger: null,
          lastProcessedEventId: null,
          runAt,
          success: false,
          errorSummary: `Cursor advancement blocked by ${match.ambiguousEvents.length} ambiguous event(s)`,
          counts,
        })
    : cursorBefore;

  if (shouldAdvance || shouldRecordBlocked) {
    await deps.saveState(cursorAfter);
  }

  const cursorBehavior = shouldAdvance
    ? 'advanced'
    : shouldRecordBlocked
      ? 'blocked_ambiguous'
      : 'read_only';

  return {
    ...input,
    cursorBehavior,
    cursorBefore,
    cursorAfter,
    counts,
    parsedEvents,
    parseIssues,
    ...match,
  };
};

export const createPrismaReconciliationDependencies = (
  prisma: any,
): Pick<ReconciliationDependencies, 'loadDeposits' | 'loadTokens' | 'loadState' | 'saveState' | 'applyDepositRepair' | 'applyWithdrawalRepair' | 'now'> => {
  let configId: number | null = null;

  return {
    now: () => new Date(),
    loadState: async () => {
      const config = await prisma.config.findFirst({
        select: { id: true, reconciliationState: true },
      });
      configId = config?.id ?? null;
      return normalizeReconciliationState(config?.reconciliationState);
    },
    saveState: async (state) => {
      if (configId === null) {
        throw new Error('Cannot save reconciliation state: config row not found');
      }
      await prisma.config.update({
        where: { id: configId },
        data: { reconciliationState: state },
      });
    },
    loadDeposits: async (events, contractIds) => {
      const depositIds = [...new Set(events.map((event) => event.depositId))];
      if (depositIds.length === 0) return [];

      return prisma.deposit.findMany({
        where: {
          vaquitaContractAddress: { in: contractIds },
          depositIdHex: { in: depositIds },
        },
        select: {
          id: true,
          walletAddress: true,
          depositIdHex: true,
          status: true,
          transactionHash: true,
          vaquitaContractAddress: true,
          withdrawals: {
            select: {
              id: true,
              depositId: true,
              status: true,
              transactionHash: true,
            },
          },
        },
      });
    },
    loadTokens: async (events, contractIds) => {
      const tokenContracts = [...new Set(events.map((event) => event.token))];
      if (tokenContracts.length === 0 && contractIds.length === 0) return [];

      return prisma.token.findMany({
        where: {
          deletedAt: null,
          OR: [
            ...(tokenContracts.length > 0 ? [{ contractAddress: { in: tokenContracts } }] : []),
            ...(contractIds.length > 0 ? [{ vaquitaContractAddress: { in: contractIds } }] : []),
          ],
        },
        select: {
          id: true,
          contractAddress: true,
          vaquitaContractAddress: true,
          decimals: true,
          lockPeriods: true,
        },
      });
    },
    applyDepositRepair: async (repair) => {
      if (repair.type === 'create_deposit') {
        const ledgerClosedAt = repair.event.ledgerClosedAt ? new Date(repair.event.ledgerClosedAt) : null;
        const confirmedAt = ledgerClosedAt && Number.isFinite(ledgerClosedAt.getTime()) ? ledgerClosedAt : new Date();
        const existing = await prisma.deposit.findFirst({
          where: {
            depositIdHex: repair.event.depositId,
            vaquitaContractAddress: repair.event.contractId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (existing) return;

        const data = {
          status: DepositStatus.CONFIRMED,
          walletAddress: repair.event.owner,
          tokenId: repair.tokenId,
          amount: repair.amount,
          transactionHash: repair.event.txHash,
          transactionEventRaw: JSON.stringify(repair.event.raw),
          depositIdHex: repair.event.depositId,
          lockPeriod: BigInt(repair.lockPeriodMs),
          vaquitaContractAddress: repair.event.contractId,
          createdAt: confirmedAt,
          confirmedAt,
        };

        try {
          await prisma.deposit.create({ data });
        } catch (error: any) {
          if (error?.code !== 'P2002') throw error;
        }
        return;
      }

      const { depositDbId, event } = repair;
      await prisma.deposit.update({
        where: { id: depositDbId },
        data: {
          status: DepositStatus.CONFIRMED,
          transactionHash: event.txHash,
          transactionEventRaw: JSON.stringify(event.raw),
          confirmedAt: event.ledgerClosedAt ? new Date(event.ledgerClosedAt) : new Date(),
        },
      });
    },
    applyWithdrawalRepair: async ({ type, depositDbId, withdrawalDbId, event }) => {
      const data = {
        status: WithdrawalStatus.CONFIRMED,
        transactionHash: event.txHash,
        transactionEventRaw: JSON.stringify(event.raw),
        confirmedAt: event.ledgerClosedAt ? new Date(event.ledgerClosedAt) : new Date(),
      };
      if (type === 'confirm_withdrawal' && withdrawalDbId) {
        await prisma.withdrawal.update({ where: { id: withdrawalDbId }, data });
      } else {
        await prisma.withdrawal.create({ data: { ...data, depositId: depositDbId } });
      }
    },
  };
};
