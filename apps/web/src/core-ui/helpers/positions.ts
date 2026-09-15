import { DepositResponseDTO, DepositWithdrawalState } from '../types';

export type PositionStatusFilter = 'ready' | 'locked' | 'withdrawn' | 'failed';

export const POSITION_STATUSES: PositionStatusFilter[] = ['ready', 'locked', 'withdrawn', 'failed'];

/** "Now" for a deposit, correcting the clock frozen at fetch time by the cache. */
const depositNow = (d: DepositResponseDTO) =>
  d.serverTimestamp && d.fetchedAtTimestamp ? d.serverTimestamp + (Date.now() - d.fetchedAtTimestamp) : Date.now();

/** When the lock ends (ms). Past for anything already withdrawable. */
export const positionEndsAt = (d: DepositResponseDTO) => d.createdTimestamp + d.lockPeriod;

/**
 * Bucket a deposit falls into for the status filter. Deposits still being
 * processed have no bucket: they are not positions yet, so lists skip them.
 */
export const positionStatusOf = (d: DepositResponseDTO): PositionStatusFilter | null => {
  const S = DepositWithdrawalState;
  if (d.state === S.DEPOSIT_SUCCESS) return positionEndsAt(d) <= depositNow(d) ? 'ready' : 'locked';
  if (d.state === S.WITHDRAW_SUCCESS || d.state === S.WITHDRAW_SUCCESS_EARLY) return 'withdrawn';
  if (d.state === S.DEPOSIT_FAILED || d.state === S.WITHDRAW_FAILED) return 'failed';
  return null;
};

/** Every position (any status), the one ending soonest first. */
export const sortPositionsByEnd = (deposits: DepositResponseDTO[]) =>
  deposits.filter((d) => positionStatusOf(d) !== null).sort((a, b) => positionEndsAt(a) - positionEndsAt(b));
