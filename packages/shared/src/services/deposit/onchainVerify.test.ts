import { describe, expect, it, vi } from 'vitest';

vi.mock('@vaquita/db', () => ({ prisma: {} }));

import type { NormalizedDepositEvent, NormalizedWithdrawEvent } from '../reconciliation/types';
import { isAcceptableDepositNonce, MAX_DEPOSIT_NONCE } from './index';
import {
  decimalToBaseUnits,
  type DepositRowForVerification,
  matchDepositEvent,
  matchWithdrawEvent,
} from './onchainVerify';

const row = (overrides: Partial<DepositRowForVerification> = {}): DepositRowForVerification => ({
  id: 7,
  walletAddress: 'GOWNER',
  amount: '12.5',
  nonce: 3n,
  depositIdHex: 'abc123',
  vaquitaContractAddress: 'CPOOL',
  tokenDecimals: 7,
  lockPeriodMs: 604_800_000n,
  ...overrides,
});

const depositEvent = (overrides: Partial<NormalizedDepositEvent> = {}): NormalizedDepositEvent => ({
  kind: 'deposit',
  contractId: 'CPOOL',
  eventId: 'e1',
  ledger: 10,
  txHash: 'h',
  caller: 'GOWNER',
  owner: 'GOWNER',
  depositId: 'abc123',
  nonce: '3',
  token: 'CTOKEN',
  amountRaw: '125000000',
  sharesRaw: '1',
  lockPeriod: 604_800,
  raw: {},
  ...overrides,
});

const withdrawEvent = (overrides: Partial<NormalizedWithdrawEvent> = {}): NormalizedWithdrawEvent => ({
  kind: 'withdraw',
  contractId: 'CPOOL',
  eventId: 'e2',
  ledger: 11,
  txHash: 'h',
  caller: 'GOWNER',
  owner: 'GOWNER',
  depositId: 'abc123',
  token: 'CTOKEN',
  amountRaw: '125000000',
  rewardRaw: '0',
  earlyFeeRaw: '0',
  matured: false,
  lockPeriod: 604_800,
  raw: {},
  ...overrides,
});

describe('decimalToBaseUnits', () => {
  it('scales and truncates like the client', () => {
    expect(decimalToBaseUnits('12.5', 7)).toBe(125_000_000n);
    expect(decimalToBaseUnits('1.123456789', 7)).toBe(11_234_567n);
    expect(decimalToBaseUnits('3', 7)).toBe(30_000_000n);
  });

  it('rejects anything that is not a plain decimal', () => {
    expect(decimalToBaseUnits('-1', 7)).toBeNull();
    expect(decimalToBaseUnits('1e-7', 7)).toBeNull();
    expect(decimalToBaseUnits('', 7)).toBeNull();
  });
});

describe('matchDepositEvent', () => {
  it('accepts the deposit that settles the row', () => {
    const result = matchDepositEvent(row(), [depositEvent()]);
    expect(result).toEqual({ ok: true, event: depositEvent() });
  });

  it('rejects a successful transaction with no deposit for the row', () => {
    expect(matchDepositEvent(row(), []).ok).toBe(false);
  });

  it.each([
    ['another owner', { owner: 'GATTACKER' }],
    ['another pool', { contractId: 'CEVIL' }],
    ['another nonce', { nonce: '4' }],
    ['another amount', { amountRaw: '10000000' }],
    ['another lock period', { lockPeriod: 15_552_000 }],
  ])('rejects a deposit for %s', (_label, overrides) => {
    expect(matchDepositEvent(row(), [depositEvent(overrides)]).ok).toBe(false);
  });

  it('does not require a nonce on legacy rows', () => {
    expect(matchDepositEvent(row({ nonce: null }), [depositEvent({ nonce: null })]).ok).toBe(true);
  });

  it('refuses to pick between two candidate events', () => {
    const result = matchDepositEvent(row({ nonce: null }), [depositEvent(), depositEvent({ eventId: 'e3' })]);
    expect(result.ok).toBe(false);
  });
});

describe('matchWithdrawEvent', () => {
  it('accepts the withdrawal of the row position', () => {
    expect(matchWithdrawEvent(row(), [withdrawEvent()]).ok).toBe(true);
  });

  it.each([
    ['another position', { depositId: 'ffff' }],
    ['another owner', { owner: 'GATTACKER' }],
    ['another pool', { contractId: 'CEVIL' }],
  ])('rejects a withdrawal of %s', (_label, overrides) => {
    expect(matchWithdrawEvent(row(), [withdrawEvent(overrides)]).ok).toBe(false);
  });

  it('rejects a row whose position id is unknown', () => {
    expect(matchWithdrawEvent(row({ depositIdHex: null }), [withdrawEvent()]).ok).toBe(false);
  });
});

describe('isAcceptableDepositNonce', () => {
  it('accepts the next nonce and earlier unused ones', () => {
    expect(isAcceptableDepositNonce('5', '5')).toBe(true);
    expect(isAcceptableDepositNonce('0', '5')).toBe(true);
  });

  it('rejects a nonce past the wallet next nonce (column-ceiling lockout)', () => {
    expect(isAcceptableDepositNonce('6', '5')).toBe(false);
    expect(isAcceptableDepositNonce(MAX_DEPOSIT_NONCE.toString(), '0')).toBe(false);
  });

  it('rejects malformed values', () => {
    expect(isAcceptableDepositNonce('-1', '5')).toBe(false);
    expect(isAcceptableDepositNonce('1.5', '5')).toBe(false);
    expect(isAcceptableDepositNonce('18446744073709551616', '18446744073709551616')).toBe(false);
  });
});
