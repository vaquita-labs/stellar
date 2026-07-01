import { describe, expect, it } from 'vitest';
import { runBridgeConfirmationBatch, type BridgeConfirmationQueue } from './worker';
import type { BridgeTransferRecord } from './transfers';

const makeTransfer = (id: string): BridgeTransferRecord => ({
  id,
  direction: 'evm_to_stellar',
  sourceNetwork: 'base-sepolia',
  destinationNetwork: 'stellar-testnet',
  sourceWallet: '0x1111111111111111111111111111111111111111',
  destinationWallet: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  amount: '1',
  amountRaw: '1000000',
  status: 'attestation_pending',
  sourceTxHash: `0x${id}`,
  destinationTxHash: null,
  messageHash: null,
  cctpMessage: null,
  cctpAttestation: null,
  errorReason: null,
  createdAt: new Date('2026-06-29T00:00:00.000Z'),
  updatedAt: new Date('2026-06-29T00:00:00.000Z'),
});

class MemoryQueue implements BridgeConfirmationQueue {
  rows = [makeTransfer('1'), makeTransfer('2'), makeTransfer('3')];

  async claimPending(limit: number) {
    return this.rows.slice(0, limit);
  }

  async save(row: BridgeTransferRecord) {
    const index = this.rows.findIndex((item) => item.id === row.id);
    this.rows[index] = row;
    return row;
  }
}

describe('bridge confirmation worker', () => {
  it('processes a bounded batch of known transfers', async () => {
    const queue = new MemoryQueue();

    const result = await runBridgeConfirmationBatch({
      queue,
      batchSize: 2,
      getAttestation: async () => ({
        status: 'complete',
        message: '0xmessage',
        attestation: '0xattestation',
      }),
    });

    expect(result).toEqual({ claimed: 2, refreshed: 2, relayed: 0, ready: 2, needsReview: 0, stale: 0 });
    expect(queue.rows.map((row) => row.status)).toEqual([
      'ready_to_complete',
      'ready_to_complete',
      'attestation_pending',
    ]);
  });

  it('moves stale transfers to needs review without polling attestation', async () => {
    const queue = new MemoryQueue();
    const firstRow = queue.rows[0]!;
    queue.rows[0] = {
      ...firstRow,
      updatedAt: new Date('2026-06-29T00:00:00.000Z'),
    };

    const result = await runBridgeConfirmationBatch({
      queue,
      batchSize: 1,
      now: new Date('2026-06-29T00:31:00.000Z'),
      staleAfterMs: 30 * 60 * 1000,
      getAttestation: async () => {
        throw new Error('attestation should not be polled for stale rows');
      },
    });

    expect(result).toEqual({ claimed: 1, refreshed: 0, relayed: 0, ready: 0, needsReview: 1, stale: 1 });
    expect(queue.rows[0]).toMatchObject({
      status: 'needs_review',
      errorReason: 'Bridge transfer exceeded stale threshold',
    });
  });

  it('relays ready EVM to Stellar transfers and completes them', async () => {
    const queue = new MemoryQueue();
    queue.rows[0] = {
      ...queue.rows[0]!,
      status: 'ready_to_complete',
      cctpMessage: '0xmessage',
      cctpAttestation: '0xattestation',
    };

    const result = await runBridgeConfirmationBatch({
      queue,
      batchSize: 1,
      relayDestination: async (transfer) => {
        expect(transfer.id).toBe('1');
        expect(transfer.cctpMessage).toBe('0xmessage');
        expect(transfer.cctpAttestation).toBe('0xattestation');
        return { destinationTxHash: 'stellar-destination-hash' };
      },
      getAttestation: async () => {
        throw new Error('ready transfers should not poll attestation');
      },
    });

    expect(result).toEqual({ claimed: 1, refreshed: 0, relayed: 1, ready: 0, needsReview: 0, stale: 0 });
    expect(queue.rows[0]).toMatchObject({
      status: 'completed',
      destinationTxHash: 'stellar-destination-hash',
    });
  });

  it('moves relay failures to needs review with a support-readable reason', async () => {
    const queue = new MemoryQueue();
    queue.rows[0] = {
      ...queue.rows[0]!,
      status: 'ready_to_complete',
      cctpMessage: '0xmessage',
      cctpAttestation: '0xattestation',
    };

    const result = await runBridgeConfirmationBatch({
      queue,
      batchSize: 1,
      relayDestination: async () => {
        throw new Error('relay account has no XLM');
      },
    });

    expect(result).toEqual({ claimed: 1, refreshed: 0, relayed: 0, ready: 0, needsReview: 1, stale: 0 });
    expect(queue.rows[0]).toMatchObject({
      status: 'needs_review',
      errorReason: 'Destination relay failed: relay account has no XLM',
    });
  });
});
