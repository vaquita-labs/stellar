import { DepositStatus, WithdrawalStatus } from '../../types';
import type {
  AmbiguousReconciliationEvent,
  NormalizedReconciliationEvent,
  NormalizedDepositEvent,
  PlannedCreateDepositRepair,
  PlannedDepositRepair,
  PlannedWithdrawalRepair,
  ReconciliationDepositRecord,
  ReconciliationMatchResult,
  ReconciliationTokenRecord,
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

const rawAmountToDecimalString = (raw: string, decimals: number | null | undefined): string | null => {
  const decimalPlaces = typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0
    ? decimals
    : null;
  if (decimalPlaces === null) return null;
  if (!/^\d+$/.test(raw)) return null;

  const normalized = raw.replace(/^0+/, '') || '0';
  if (normalized === '0') return null;
  if (decimalPlaces === 0) return normalized;

  const padded = normalized.padStart(decimalPlaces + 1, '0');
  const whole = padded.slice(0, padded.length - decimalPlaces);
  const fraction = padded.slice(padded.length - decimalPlaces).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

const lockPeriodMsFor = (event: NormalizedDepositEvent): number | null => {
  const lockPeriodMs = event.lockPeriod * 1000;
  if (!Number.isSafeInteger(lockPeriodMs) || lockPeriodMs <= 0) return null;
  return lockPeriodMs;
};

const supportsLockPeriod = (token: ReconciliationTokenRecord, lockPeriodMs: number): boolean =>
  token.lockPeriods.some((period) => {
    const value = typeof period === 'bigint' ? Number(period) : period;
    return Number.isSafeInteger(value) && value === lockPeriodMs;
  });

const planCreateDeposit = (
  event: NormalizedDepositEvent,
  tokens: ReconciliationTokenRecord[],
): PlannedCreateDepositRepair | AmbiguousReconciliationEvent => {
  const token = tokens.find((candidate) => sameText(candidate.contractAddress, event.token));
  if (!token) return ambiguity(event, 'unknown_token', []);
  if (!sameText(token.vaquitaContractAddress, event.contractId)) {
    return ambiguity(event, 'contract_mismatch', []);
  }

  const amount = rawAmountToDecimalString(event.amountRaw, token.decimals);
  if (!amount) return ambiguity(event, 'malformed_amount', []);

  const lockPeriodMs = lockPeriodMsFor(event);
  if (lockPeriodMs === null || !supportsLockPeriod(token, lockPeriodMs)) {
    return ambiguity(event, 'unsupported_lock_period', []);
  }

  return {
    type: 'create_deposit',
    tokenId: token.id,
    amount,
    lockPeriodMs,
    event,
  };
};

export const matchReconciliationEvents = (
  events: NormalizedReconciliationEvent[],
  deposits: ReconciliationDepositRecord[],
  tokens: ReconciliationTokenRecord[] = [],
): ReconciliationMatchResult => {
  const plannedDepositRepairs: PlannedDepositRepair[] = [];
  const plannedWithdrawalRepairs: PlannedWithdrawalRepair[] = [];
  const ambiguousEvents: AmbiguousReconciliationEvent[] = [];
  const skippedEvents: NormalizedReconciliationEvent[] = [];

  for (const event of events) {
    const candidates = findDepositCandidates(event, deposits);
    if (candidates.length === 0) {
      if (event.kind === 'deposit') {
        const repair = planCreateDeposit(event, tokens);
        if ('type' in repair) {
          plannedDepositRepairs.push(repair);
        } else {
          ambiguousEvents.push(repair);
        }
      } else {
        ambiguousEvents.push(ambiguity(event, 'missing_deposit', []));
      }
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
