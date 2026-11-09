/**
 * Where a money notification opens: the detail of the movement it is about.
 *
 * Nothing new is stored for this. Every money notification is already emitted
 * with a `dedupeKey` that names its row (`deposit-confirmed-<depositId>`,
 * `withdrawal-confirmed-<withdrawalId>`, …), so the target is read back out of
 * it when the feed is served. That covers the notifications written before
 * this existed, which all carry a plain `/transactions`, without touching a
 * single row.
 *
 * The ids are the web app's own (`buildTransactions` in
 * apps/web/src/core-ui/helpers/transactions.ts): `d-<depositId>` for the
 * transfer into a position, `w-<depositId>-<withdrawalId>` for a withdrawal.
 * A withdrawal's key only has its own id, so its deposit comes from a lookup.
 */
export type MovementRef = { kind: 'deposit'; depositId: number } | { kind: 'withdrawal'; withdrawalId: number };

const MOVEMENT_KEY = /^(deposit-confirmed|deposit-unlocked|withdrawal-confirmed)-(\d+)$/;

export const parseMovementRef = (dedupeKey: string | null | undefined): MovementRef | null => {
  const match = dedupeKey ? MOVEMENT_KEY.exec(dedupeKey) : null;
  if (!match) return null;
  const id = Number(match[2]);
  // An unlocked deposit has no movement of its own: it points at the transfer
  // that opened the position, which is the one now free to withdraw.
  return match[1] === 'withdrawal-confirmed' ? { kind: 'withdrawal', withdrawalId: id } : { kind: 'deposit', depositId: id };
};

/** `null` when the movement can't be placed (a withdrawal whose row is gone):
 *  the caller keeps whatever link the notification was stored with. */
export const movementLink = (ref: MovementRef, depositIdByWithdrawalId: Map<number, number>): string | null => {
  if (ref.kind === 'deposit') return `/transactions/d-${ref.depositId}`;
  const depositId = depositIdByWithdrawalId.get(ref.withdrawalId);
  return depositId === undefined ? null : `/transactions/w-${depositId}-${ref.withdrawalId}`;
};
