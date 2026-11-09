import { describe, expect, it } from 'vitest';
import { movementLink, parseMovementRef } from './movementLink';

describe('parseMovementRef', () => {
  it('reads the deposit out of a confirmed or unlocked deposit key', () => {
    expect(parseMovementRef('deposit-confirmed-115')).toEqual({ kind: 'deposit', depositId: 115 });
    expect(parseMovementRef('deposit-unlocked-115')).toEqual({ kind: 'deposit', depositId: 115 });
  });

  it('reads the withdrawal out of a confirmed withdrawal key', () => {
    expect(parseMovementRef('withdrawal-confirmed-90')).toEqual({ kind: 'withdrawal', withdrawalId: 90 });
  });

  it('ignores keys that are not about a movement', () => {
    expect(parseMovementRef('follow-1-2')).toBeNull();
    expect(parseMovementRef('deposit-confirmed-')).toBeNull();
    expect(parseMovementRef('deposit-confirmed-12-extra')).toBeNull();
    expect(parseMovementRef(null)).toBeNull();
    expect(parseMovementRef(undefined)).toBeNull();
  });
});

describe('movementLink', () => {
  it('points a deposit at the transfer into its position', () => {
    expect(movementLink({ kind: 'deposit', depositId: 115 }, new Map())).toBe('/transactions/d-115');
  });

  it('points a withdrawal at its own movement, under its deposit', () => {
    expect(movementLink({ kind: 'withdrawal', withdrawalId: 90 }, new Map([[90, 115]]))).toBe('/transactions/w-115-90');
  });

  it('gives up on a withdrawal whose deposit is unknown', () => {
    expect(movementLink({ kind: 'withdrawal', withdrawalId: 90 }, new Map())).toBeNull();
  });
});
