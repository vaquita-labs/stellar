import { describe, expect, it } from 'vitest';

import { DepositStatus, WithdrawalStatus } from '../../types';
import { matchReconciliationEvents } from './matcher';
import type {
  NormalizedDepositEvent,
  NormalizedWithdrawEvent,
  ReconciliationDepositRecord,
  ReconciliationTokenRecord,
} from './types';

const depositEvent = (overrides: Partial<NormalizedDepositEvent> = {}): NormalizedDepositEvent => ({
  kind: 'deposit',
  contractId: 'CCONTRACT',
  eventId: 'e1',
  ledger: 10,
  txHash: 'tx-deposit',
  caller: 'GOWNER',
  owner: 'GOWNER',
  depositId: 'dep-1',
  token: 'CTOKEN',
  amountRaw: '1000',
  sharesRaw: '1000',
  lockPeriod: 604800,
  raw: {},
  ...overrides,
});

const withdrawEvent = (overrides: Partial<NormalizedWithdrawEvent> = {}): NormalizedWithdrawEvent => ({
  kind: 'withdraw',
  contractId: 'CCONTRACT',
  eventId: 'e2',
  ledger: 11,
  txHash: 'tx-withdraw',
  caller: 'GOWNER',
  owner: 'GOWNER',
  depositId: 'dep-1',
  token: 'CTOKEN',
  amountRaw: '1000',
  rewardRaw: '10',
  earlyFeeRaw: '0',
  matured: true,
  lockPeriod: 604800,
  raw: {},
  ...overrides,
});

const dbDeposit = (overrides: Partial<ReconciliationDepositRecord> = {}): ReconciliationDepositRecord => ({
  id: 1,
  walletAddress: 'GOWNER',
  depositIdHex: 'dep-1',
  status: DepositStatus.INITIATED,
  transactionHash: null,
  vaquitaContractAddress: 'CCONTRACT',
  withdrawals: [],
  ...overrides,
});

const dbToken = (overrides: Partial<ReconciliationTokenRecord> = {}): ReconciliationTokenRecord => ({
  id: 7,
  contractAddress: 'CTOKEN',
  vaquitaContractAddress: 'CCONTRACT',
  decimals: 7,
  lockPeriods: [604800000n],
  ...overrides,
});

describe('reconciliation matcher', () => {
  it('plans an unambiguous deposit confirmation', () => {
    const result = matchReconciliationEvents([depositEvent()], [dbDeposit()]);

    expect(result.plannedDepositRepairs).toEqual([
      expect.objectContaining({ type: 'confirm_deposit', depositDbId: 1 }),
    ]);
    expect(result.ambiguousEvents).toEqual([]);
  });

  it('skips an already-confirmed matching deposit', () => {
    const event = depositEvent();
    const result = matchReconciliationEvents(
      [event],
      [dbDeposit({ status: DepositStatus.CONFIRMED, transactionHash: event.txHash })],
    );

    expect(result.plannedDepositRepairs).toEqual([]);
    expect(result.skippedEvents).toEqual([event]);
  });

  it('plans creating a confirmed deposit for a safe missing DB record', () => {
    const result = matchReconciliationEvents([depositEvent({ amountRaw: '50000000' })], [], [dbToken()]);

    expect(result.plannedDepositRepairs).toEqual([
      expect.objectContaining({
        type: 'create_deposit',
        tokenId: 7,
        amount: '5',
        lockPeriodMs: 604800000,
      }),
    ]);
    expect(result.ambiguousEvents).toEqual([]);
  });

  it('keeps missing deposit records ambiguous when the token is unknown', () => {
    const result = matchReconciliationEvents([depositEvent()], []);

    expect(result.ambiguousEvents).toEqual([
      expect.objectContaining({ reason: 'unknown_token', candidateDepositIds: [] }),
    ]);
  });

  it('keeps missing deposit records ambiguous when the token pool address does not match the event contract', () => {
    const result = matchReconciliationEvents([depositEvent()], [], [
      dbToken({ vaquitaContractAddress: 'COTHERPOOL' }),
    ]);

    expect(result.ambiguousEvents).toEqual([
      expect.objectContaining({ reason: 'contract_mismatch', candidateDepositIds: [] }),
    ]);
  });

  it('keeps missing deposit records ambiguous when the event amount is malformed', () => {
    const result = matchReconciliationEvents([depositEvent({ amountRaw: 'not-a-number' })], [], [dbToken()]);

    expect(result.ambiguousEvents).toEqual([
      expect.objectContaining({ reason: 'malformed_amount', candidateDepositIds: [] }),
    ]);
  });

  it('keeps missing deposit records ambiguous when the lock period is unsupported', () => {
    const result = matchReconciliationEvents([depositEvent({ lockPeriod: 2592000 })], [], [dbToken()]);

    expect(result.ambiguousEvents).toEqual([
      expect.objectContaining({ reason: 'unsupported_lock_period', candidateDepositIds: [] }),
    ]);
  });

  it('reports duplicate deposit candidates as ambiguous', () => {
    const result = matchReconciliationEvents([depositEvent()], [dbDeposit({ id: 1 }), dbDeposit({ id: 2 })]);

    expect(result.ambiguousEvents).toEqual([
      expect.objectContaining({ reason: 'duplicate_deposits', candidateDepositIds: [1, 2] }),
    ]);
  });

  it('plans confirming one initiated withdrawal', () => {
    const result = matchReconciliationEvents(
      [withdrawEvent()],
      [dbDeposit({
        status: DepositStatus.CONFIRMED,
        withdrawals: [{ id: 5, depositId: 1, status: WithdrawalStatus.INITIATED, transactionHash: null }],
      })],
    );

    expect(result.plannedWithdrawalRepairs).toEqual([
      expect.objectContaining({ type: 'confirm_withdrawal', depositDbId: 1, withdrawalDbId: 5 }),
    ]);
  });

  it('plans creating a confirmed withdrawal when no withdrawal row exists', () => {
    const result = matchReconciliationEvents([withdrawEvent()], [dbDeposit({ status: DepositStatus.CONFIRMED })]);

    expect(result.plannedWithdrawalRepairs).toEqual([
      expect.objectContaining({ type: 'create_confirmed_withdrawal', depositDbId: 1 }),
    ]);
  });

  it('reports duplicate initiated withdrawals as ambiguous', () => {
    const result = matchReconciliationEvents(
      [withdrawEvent()],
      [dbDeposit({
        withdrawals: [
          { id: 5, depositId: 1, status: WithdrawalStatus.INITIATED, transactionHash: null },
          { id: 6, depositId: 1, status: WithdrawalStatus.INITIATED, transactionHash: null },
        ],
      })],
    );

    expect(result.ambiguousEvents).toEqual([
      expect.objectContaining({
        reason: 'duplicate_withdrawals',
        candidateDepositIds: [1],
        candidateWithdrawalIds: [5, 6],
      }),
    ]);
  });
});
