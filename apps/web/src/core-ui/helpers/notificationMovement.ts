import type { AppTransaction, TransactionHistoryEntry } from './transactions';

/**
 * Which movement a money notification is about, worked out on the client.
 *
 * The API resolves this itself (`movementLink` in @vaquita/shared) and serves
 * `/transactions/<id>`. This is the fallback for a feed that still comes with
 * the plain `/transactions` (an API that hasn't shipped that yet): the
 * notification doesn't carry the row it was emitted for, but it was written at
 * the moment the movement happened, so the movement is the one of that kind
 * closest in time, preferring the same amount.
 */
type MoneyNotification = {
  messageKey: string;
  params: Record<string, string | number>;
  /** epoch ms */
  createdAt: number;
};

/** A confirmation and its notification are written together; a day of slack
 *  covers a confirmation timestamp the API didn't record (it falls back to the
 *  creation of the row). Further than that it is another movement. */
const CONFIRMATION_WINDOW = 24 * 60 * 60 * 1000;

const stepTime = (tx: AppTransaction, key: TransactionHistoryEntry['key']) =>
  tx.history.find((step) => step.key === key)?.timestamp ?? tx.timestamp;

export const notificationMovementId = (n: MoneyNotification, transactions: AppTransaction[]): string | null => {
  const completed = transactions.filter((tx) => tx.status === 'completed');
  let candidates: { tx: AppTransaction; at: number }[];

  if (n.messageKey === 'withdrawalCompleted') {
    candidates = completed
      .filter((tx) => tx.kind === 'withdraw')
      .map((tx) => ({ tx, at: stepTime(tx, 'withdrawConfirmed') }))
      .filter(({ at }) => Math.abs(at - n.createdAt) <= CONFIRMATION_WINDOW);
  } else if (n.messageKey === 'depositConfirmed') {
    candidates = completed
      .filter((tx) => tx.kind === 'move')
      .map((tx) => ({ tx, at: stepTime(tx, 'moveConfirmed') }))
      .filter(({ at }) => Math.abs(at - n.createdAt) <= CONFIRMATION_WINDOW);
  } else if (n.messageKey === 'depositUnlocked') {
    // Emitted lazily, the first time the feed is read after the lock ends: it
    // can be any time after the unlock, never before. It points at the
    // transfer that opened the position.
    candidates = completed
      .filter((tx) => tx.kind === 'move')
      .map((tx) => ({ tx, at: stepTime(tx, 'moveConfirmed') + tx.lockPeriod }))
      .filter(({ at }) => at <= n.createdAt);
  } else {
    return null;
  }

  const amount = String(n.params.amount ?? '');
  const sameAmount = candidates.filter(({ tx }) => tx.amount.toFixed(2) === amount);
  const pool = sameAmount.length ? sameAmount : candidates;

  let best: { tx: AppTransaction; at: number } | null = null;
  for (const candidate of pool) {
    if (!best || Math.abs(candidate.at - n.createdAt) < Math.abs(best.at - n.createdAt)) best = candidate;
  }
  return best?.tx.id ?? null;
};
