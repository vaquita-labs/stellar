import { describe, expect, it } from 'vitest';
import { TxPendingError } from '@/networks/stellar/pollarError';
import { humanizeTxError } from './txError';

describe('humanizeTxError', () => {
  it('reports a still-confirming transaction without inviting a retry', () => {
    const result = humanizeTxError(new TxPendingError('HASH'));

    expect(result.pending).toBe(true);
    expect(result.hash).toBe('HASH');
    expect(result.title).toContain('still confirming');
    expect(result.title).not.toMatch(/try again\.$/);
  });

  it('reads a declined signature as a cancellation, not a failure', () => {
    expect(humanizeTxError(new Error('User declined the signature request in the wallet')).title).toBe(
      'You cancelled the signature. No changes were made.',
    );
    expect(humanizeTxError('The user rejected the transaction').title).toContain('cancelled the signature');
  });

  it('maps a known contract error to its explanation', () => {
    expect(humanizeTxError(new Error('HostError: Error(Contract, #10)')).title).toContain("don't have enough USDC");
    expect(humanizeTxError(new Error('Error(Contract, #13)')).title).toContain('trustline');
  });

  it('maps an unknown contract error to the generic rejection', () => {
    expect(humanizeTxError(new Error('Error(Contract, #999)')).title).toBe(
      'The network rejected the transaction. Please try again.',
    );
  });

  it('tells the user to check the balance before retrying a timeout', () => {
    const result = humanizeTxError(new Error('request timed out'));

    // A timeout can hide an already-submitted transaction, so it never promises
    // that repeating is safe.
    expect(result.title).toContain('Check your balance');
    expect(result.pending).toBeUndefined();
  });

  it('never leaks a raw SDK message into the title', () => {
    const result = humanizeTxError(new Error('Pollar withdraw failed'));

    expect(result.title).toBe("We couldn't complete the transaction. Please try again in a moment.");
    expect(result.raw).toBe('Pollar withdraw failed');
  });

  it('handles an empty or missing error', () => {
    expect(humanizeTxError(null).title).toBe("We couldn't complete the transaction. Please try again in a moment.");
    expect(humanizeTxError(null).raw).toBe('');
  });
});
