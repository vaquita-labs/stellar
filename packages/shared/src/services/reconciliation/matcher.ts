import { DepositStatus, WithdrawalStatus } from '../../types';
import type {
  AmbiguousReconciliationEvent,
  NormalizedReconciliationEvent,
  PlannedDepositRepair,
  PlannedWithdrawalRepair,
  ReconciliationDepositRecord,
  ReconciliationMatchResult,
} from './types';

const sameText = (a: string | null | undefined, b: string): boolean => (a ?? '').toLowerCase() === b.toLowerCase();

const findDepositCandidates = (
  event: NormalizedReconciliationEvent,
  deposits: ReconciliationDepositRecord[],
): ReconciliationDepositRecord[] =>
  deposits.filter((deposit) =>
    sameText(deposit.vaquitaContractAddress, event.contractId) &&
    sameText(deposit.depositIdHex, event.depositId),
  );

const ambiguity = (
  event: NormalizedReconciliationEvent,
  reason: AmbiguousReconciliationEvent['reason'],
  deposits: ReconciliationDepositRecord[],
  withdrawalIds?: number[],
): AmbiguousReconciliationEvent => ({
  kind: event.kind,
  event,
  reason,
  candidateDepositIds: deposits.map((deposit) => deposit.id),
  ...(withdrawalIds ? { candidateWithdrawalIds: withdrawalIds } : {}),
});

export const matchReconciliationEvents = (
  events: NormalizedReconciliationEvent[],
  deposits: ReconciliationDepositRecord[],
): ReconciliationMatchResult => {
  const plannedDepositRepairs: PlannedDepositRepair[] = [];
  const plannedWithdrawalRepairs: PlannedWithdrawalRepair[] = [];
  const ambiguousEvents: AmbiguousReconciliationEvent[] = [];
  const skippedEvents: NormalizedReconciliationEvent[] = [];

  for (const event of events) {
    const candidates = findDepositCandidates(event, deposits);
    if (candidates.length === 0) {
      ambiguousEvents.push(ambiguity(event, 'missing_deposit', []));
      continue;
    }
    if (candidates.length > 1) {
      ambiguousEvents.push(ambiguity(event, 'duplicate_deposits', candidates));
      continue;
    }

    const deposit = candidates[0]!;
    if (!sameText(deposit.walletAddress, event.owner)) {
      ambiguousEvents.push(ambiguity(event, 'wallet_mismatch', candidates));
      continue;
    }

    if (event.kind === 'deposit') {
      const alreadyConfirmed =
        deposit.status === DepositStatus.CONFIRMED &&
        sameText(deposit.transactionHash, event.txHash);
      if (alreadyConfirmed) {
        skippedEvents.push(event);
      } else {
        plannedDepositRepairs.push({ type: 'confirm_deposit', depositDbId: deposit.id, event });
      }
      continue;
    }

    const confirmedWithdrawals = deposit.withdrawals.filter(
      (withdrawal) => withdrawal.status === WithdrawalStatus.CONFIRMED,
    );
    if (confirmedWithdrawals.some((withdrawal) => sameText(withdrawal.transactionHash, event.txHash))) {
      skippedEvents.push(event);
      continue;
    }

    const initiated = deposit.withdrawals.filter((withdrawal) => withdrawal.status === WithdrawalStatus.INITIATED);
    if (initiated.length > 1) {
      ambiguousEvents.push(ambiguity(event, 'duplicate_withdrawals', candidates, initiated.map((w) => w.id)));
      continue;
    }
    if (initiated.length === 1) {
      const withdrawal = initiated[0]!;
      plannedWithdrawalRepairs.push({
        type: 'confirm_withdrawal',
        depositDbId: deposit.id,
        withdrawalDbId: withdrawal.id,
        event,
      });
    } else {
      plannedWithdrawalRepairs.push({
        type: 'create_confirmed_withdrawal',
        depositDbId: deposit.id,
        event,
      });
    }
  }

  return { plannedDepositRepairs, plannedWithdrawalRepairs, ambiguousEvents, skippedEvents };
};
