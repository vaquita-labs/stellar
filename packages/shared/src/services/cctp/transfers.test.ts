import { describe, expect, it } from 'vitest';
import {
  attachBridgeSourceTx,
  attachBridgeDestinationTx,
  createBridgeTransfer,
  listActiveBridgeTransfers,
  refreshBridgeTransfer,
  type BridgeTransferRecord,
  type BridgeTransferRepository,
} from './transfers';

class MemoryBridgeTransferRepository implements BridgeTransferRepository {
  private rows = new Map<string, BridgeTransferRecord>();
  private nextId = 1;

  async create(input: Omit<BridgeTransferRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date('2026-06-29T00:00:00.000Z');
    const row = { ...input, id: String(this.nextId++), createdAt: now, updatedAt: now };
    this.rows.set(row.id, row);
    return row;
  }

  async getById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async findBySourceTxHash(sourceTxHash: string) {
    return [...this.rows.values()].find((row) => row.sourceTxHash === sourceTxHash) ?? null;
  }

  async listActiveForWallet(walletAddress: string) {
    return [...this.rows.values()].filter(
      (row) =>
        [row.sourceWallet, row.destinationWallet].includes(walletAddress) &&
        !['completed', 'failed', 'cancelled'].includes(row.status),
    );
  }

  async update(id: string, patch: Partial<BridgeTransferRecord>) {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Missing row ${id}`);
    const updated = { ...row, ...patch, id, updatedAt: new Date('2026-06-29T00:01:00.000Z') };
    this.rows.set(id, updated);
    return updated;
  }
}

describe('bridge transfer tracker', () => {
  it('accepts the local happy-flow Base Sepolia to Stellar payload', async () => {
    const repo = new MemoryBridgeTransferRepository();

    const transfer = await createBridgeTransfer(repo, {
      direction: 'evm_to_stellar',
      sourceNetwork: 'base-sepolia',
      destinationNetwork: 'stellar-testnet',
      sourceWallet: '0xbe9078b15baa4a7e3a0848a2a4adef6014b2dbff',
      destinationWallet: 'GC2FQAFDJJAEAVUNZUUQYK3BGEUE6JD3GFLNNJCRE2LP5DNFGU243R3W',
      amount: '1',
    });

    expect(transfer).toMatchObject({
      direction: 'evm_to_stellar',
      sourceNetwork: 'base-sepolia',
      destinationNetwork: 'stellar-testnet',
      amountRaw: '1000000',
      status: 'source_awaiting_signature',
    });
  });

  it('rejects direction and network family mismatches before signing', async () => {
    const repo = new MemoryBridgeTransferRepository();

    await expect(createBridgeTransfer(repo, {
      direction: 'evm_to_stellar',
      sourceNetwork: 'stellar-testnet',
      destinationNetwork: 'base-sepolia',
      sourceWallet: '0x1111111111111111111111111111111111111111',
      destinationWallet: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      amount: '1',
    })).rejects.toThrow(/source network must be evm/i);

    await expect(createBridgeTransfer(repo, {
      direction: 'stellar_to_evm',
      sourceNetwork: 'base-sepolia',
      destinationNetwork: 'stellar-testnet',
      sourceWallet: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      destinationWallet: '0x1111111111111111111111111111111111111111',
      amount: '1',
    })).rejects.toThrow(/source network must be stellar/i);
  });

  it('creates resumable transfers and advances through attestation readiness', async () => {
    const repo = new MemoryBridgeTransferRepository();
    const transfer = await createBridgeTransfer(repo, {
      direction: 'evm_to_stellar',
      sourceNetwork: 'base-sepolia',
      destinationNetwork: 'stellar-testnet',
      sourceWallet: '0x1111111111111111111111111111111111111111',
      destinationWallet: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      amount: '12.5',
    });

    expect(transfer).toMatchObject({
      status: 'source_awaiting_signature',
      amountRaw: '12500000',
    });

    const sourceAttached = await attachBridgeSourceTx(repo, transfer.id, {
      sourceTxHash: '0xabc',
      messageHash: '0xmessage',
    });
    const attachedAgain = await attachBridgeSourceTx(repo, transfer.id, {
      sourceTxHash: '0xabc',
      messageHash: '0xmessage',
    });

    expect(sourceAttached.status).toBe('attestation_pending');
    expect(attachedAgain).toEqual(sourceAttached);

    const ready = await refreshBridgeTransfer(repo, transfer.id, async () => ({
      status: 'complete',
      message: '0xraw-message',
      attestation: '0xattestation',
    }));

    expect(ready).toMatchObject({
      status: 'ready_to_complete',
      cctpMessage: '0xraw-message',
      cctpAttestation: '0xattestation',
    });
    await expect(listActiveBridgeTransfers(repo, transfer.sourceWallet)).resolves.toHaveLength(1);
  });

  it('keeps destination tx attach idempotent and blocks terminal mutation', async () => {
    const repo = new MemoryBridgeTransferRepository();
    const transfer = await createBridgeTransfer(repo, {
      direction: 'evm_to_stellar',
      sourceNetwork: 'base-sepolia',
      destinationNetwork: 'stellar-testnet',
      sourceWallet: '0x1111111111111111111111111111111111111111',
      destinationWallet: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      amount: '1',
    });

    await attachBridgeSourceTx(repo, transfer.id, { sourceTxHash: '0xsource' });
    const ready = await refreshBridgeTransfer(repo, transfer.id, async () => ({
      status: 'complete',
      message: '0xmessage',
      attestation: '0xattestation',
    }));

    const completed = await attachBridgeDestinationTx(repo, ready.id, { destinationTxHash: '0xdestination' });
    const completedAgain = await attachBridgeDestinationTx(repo, ready.id, { destinationTxHash: '0xdestination' });

    expect(completed.status).toBe('completed');
    expect(completedAgain).toEqual(completed);
    await expect(attachBridgeSourceTx(repo, ready.id, { sourceTxHash: '0xother' }))
      .rejects.toThrow(/terminal/i);
  });
});
