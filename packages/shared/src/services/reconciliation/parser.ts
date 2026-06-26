import { scValToNative, xdr } from '@stellar/stellar-sdk';

import type {
  NormalizedDepositEvent,
  NormalizedReconciliationEvent,
  NormalizedWithdrawEvent,
  RawReconciliationEvent,
  ReconciliationParseIssue,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  if (isRecord(value) && typeof value.address === 'function') return String(value.address());
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

const decodeScVal = (value: unknown): unknown => {
  if (isRecord(value) && typeof value.toXDR === 'function' && typeof value.switch === 'function') {
    try {
      return scValToNative(value as unknown as xdr.ScVal);
    } catch {
      return value;
    }
  }
  if (typeof value !== 'string') return value;

  try {
    return scValToNative(xdr.ScVal.fromXDR(value, 'base64'));
  } catch {
    return value;
  }
};

const normalizeNativeValue = (value: unknown): Record<string, unknown> | null => {
  const decoded = decodeScVal(value);
  if (decoded instanceof Map) return Object.fromEntries(decoded.entries());
  if (isRecord(decoded)) return decoded;
  return null;
};

const decodeTopic = (topic: unknown[] | undefined): unknown[] => (topic ?? []).map(decodeScVal);

const eventIdOf = (event: RawReconciliationEvent): string =>
  event.id ?? event.pagingToken ?? `${event.ledger ?? 'unknown'}:${event.txHash ?? event.transactionHash ?? 'unknown'}`;

const issue = (event: RawReconciliationEvent, reason: string): ReconciliationParseIssue => ({
  eventId: eventIdOf(event),
  ledger: event.ledger ?? null,
  contractId: event.contractId ?? null,
  reason,
});

const baseFields = (event: RawReconciliationEvent) => {
  const topic = decodeTopic(event.topic);
  const eventName = asString(topic[0]);
  const caller = asString(topic[1]);
  const value = normalizeNativeValue(event.value);
  const ledger = asNumber(event.ledger);
  const contractId = asString(event.contractId);
  const txHash = asString(event.txHash ?? event.transactionHash);

  if (!eventName || (eventName !== 'deposit' && eventName !== 'withdraw')) {
    return { error: issue(event, 'unknown_event_topic') };
  }
  if (!caller) return { error: issue(event, 'missing_caller_topic') };
  if (!value) return { error: issue(event, 'malformed_event_value') };
  if (ledger === null) return { error: issue(event, 'missing_ledger') };
  if (!contractId) return { error: issue(event, 'missing_contract_id') };
  if (!txHash) return { error: issue(event, 'missing_transaction_hash') };

  return {
    eventName,
    caller,
    value,
    ledger,
    contractId,
    txHash,
    eventId: eventIdOf(event),
    ledgerClosedAt: event.ledgerClosedAt,
  };
};

export const parseVaquitaPoolEvent = (
  event: RawReconciliationEvent,
): { event: NormalizedReconciliationEvent | null; issue: ReconciliationParseIssue | null } => {
  const base = baseFields(event);
  if ('error' in base) return { event: null, issue: base.error };

  const owner = asString(base.value.owner) ?? base.caller;
  const depositId = asString(base.value.deposit_id ?? base.value.depositId);
  const token = asString(base.value.token);
  const amountRaw = asString(base.value.amount);
  const lockPeriod = asNumber(base.value.lock_period ?? base.value.lockPeriod);

  if (!owner || !depositId || !token || !amountRaw || lockPeriod === null) {
    return { event: null, issue: issue(event, 'missing_required_payload_fields') };
  }

  if (base.eventName === 'deposit') {
    const sharesRaw = asString(base.value.shares);
    if (!sharesRaw) return { event: null, issue: issue(event, 'missing_deposit_shares') };

    const parsed: NormalizedDepositEvent = {
      kind: 'deposit',
      contractId: base.contractId,
      eventId: base.eventId,
      ledger: base.ledger,
      txHash: base.txHash,
      caller: base.caller,
      owner,
      depositId,
      token,
      amountRaw,
      sharesRaw,
      lockPeriod,
      raw: event,
    };
    if (base.ledgerClosedAt) parsed.ledgerClosedAt = base.ledgerClosedAt;
    return { event: parsed, issue: null };
  }

  const rewardRaw = asString(base.value.reward);
  const earlyFeeRaw = asString(base.value.early_fee ?? base.value.earlyFee);
  const matured = base.value.matured;
  if (!rewardRaw || !earlyFeeRaw || typeof matured !== 'boolean') {
    return { event: null, issue: issue(event, 'missing_withdraw_payload_fields') };
  }

  const parsed: NormalizedWithdrawEvent = {
    kind: 'withdraw',
    contractId: base.contractId,
    eventId: base.eventId,
    ledger: base.ledger,
    txHash: base.txHash,
    caller: base.caller,
    owner,
    depositId,
    token,
    amountRaw,
    rewardRaw,
    earlyFeeRaw,
    matured,
    lockPeriod,
    raw: event,
  };
  if (base.ledgerClosedAt) parsed.ledgerClosedAt = base.ledgerClosedAt;
  return { event: parsed, issue: null };
};

export const parseVaquitaPoolEvents = (events: RawReconciliationEvent[]) => {
  const parsed: NormalizedReconciliationEvent[] = [];
  const issues: ReconciliationParseIssue[] = [];

  for (const rawEvent of events) {
    const result = parseVaquitaPoolEvent(rawEvent);
    if (result.event) parsed.push(result.event);
    if (result.issue) issues.push(result.issue);
  }

  return { parsed, issues };
};
