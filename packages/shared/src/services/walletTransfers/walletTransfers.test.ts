import { describe, expect, it } from 'vitest';
import {
  isSelfTransfer,
  recordWalletTransfer,
  type WalletTransferRecord,
  type WalletTransferRepository,
} from './walletTransfers';

const NOW = new Date('2026-09-10T12:00:00.000Z');

/** In-memory fake: the whole service is exercised without a database. */
class MemoryWalletTransferRepository implements WalletTransferRepository {
  private rows = new Map<string, WalletTransferRecord>();
  private nextId = 1;
  /** Addresses that belong to a profile, as the real lookup would report them. */
  profilesByAddress = new Map<string, number>();
  /** Raised by a test to make the next `create` fail the way the unique index does. */
  failNextCreateWith: Error | null = null;
  createCalls = 0;

  async create(input: Omit<WalletTransferRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    this.createCalls += 1;
    if (this.failNextCreateWith) {
      const error = this.failNextCreateWith;
      this.failNextCreateWith = null;
      throw error;
    }
    const row = { ...input, id: String(this.nextId++), createdAt: NOW, updatedAt: NOW };
    this.rows.set(row.transactionHash, row);
    return row;
  }

  async findByTransactionHash(transactionHash: string) {
    return this.rows.get(transactionHash) ?? null;
  }

  async findProfileIdByWalletAddress(walletAddress: string) {
    return this.profilesByAddress.get(walletAddress) ?? null;
  }

  /** Seeds a row the way a racing request would: written, but not through `create`. */
  seed(row: Omit<WalletTransferRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    this.rows.set(row.transactionHash, { ...row, id: String(this.nextId++), createdAt: NOW, updatedAt: NOW });
  }
}

const SEND = {
  walletAddress: 'GSENDER',
  tokenId: 2,
  amount: 12.5,
  destinationAddress: 'GDEST',
  transactionHash: 'hash-1',
  confirmedAt: NOW,
};

describe('isSelfTransfer', () => {
  it('recognises a payment to the sender, which is not volume', () => {
    expect(isSelfTransfer('GABC', 'GABC')).toBe(true);
    expect(isSelfTransfer('GABC', 'GDEF')).toBe(false);
  });
});

describe('recordWalletTransfer', () => {
  it('files a send to an address no profile owns as external', async () => {
    const repo = new MemoryWalletTransferRepository();

    const { data, error } = await recordWalletTransfer(repo, SEND);

    expect(error).toBeNull();
    expect(data?.inserted).toBe(true);
    expect(data?.transfer.destinationKind).toBe('external');
    expect(data?.transfer.destinationProfileId).toBeNull();
  });

  it('files a send to a profile as peer to peer and keeps the profile id', async () => {
    const repo = new MemoryWalletTransferRepository();
    repo.profilesByAddress.set('GDEST', 42);

    const { data } = await recordWalletTransfer(repo, SEND);

    expect(data?.transfer.destinationKind).toBe('vaquita_user');
    expect(data?.transfer.destinationProfileId).toBe(42);
  });

  it('ignores what the destination looks like today once the row exists', async () => {
    // The classification is frozen at insert: a profile that later claims the
    // address must not retroactively turn an external send into a peer-to-peer
    // one, or historical volume moves between two totals.
    const repo = new MemoryWalletTransferRepository();
    await recordWalletTransfer(repo, SEND);
    repo.profilesByAddress.set('GDEST', 42);

    const { data } = await recordWalletTransfer(repo, SEND);

    expect(data?.inserted).toBe(false);
    expect(data?.transfer.destinationKind).toBe('external');
  });

  it('treats a replayed hash as a recognised no-op, not an error', async () => {
    const repo = new MemoryWalletTransferRepository();
    await recordWalletTransfer(repo, SEND);

    const { data, error } = await recordWalletTransfer(repo, SEND);

    expect(error).toBeNull();
    expect(data?.inserted).toBe(false);
    expect(repo.createCalls).toBe(1);
  });

  it('returns the winner row when two requests race into the unique index', async () => {
    // The loser must not surface an error: the reporting client would retry it
    // forever against a hash that is already recorded.
    const repo = new MemoryWalletTransferRepository();
    repo.failNextCreateWith = new Error('duplicate key value violates unique constraint');
    repo.seed({
      ...SEND,
      destinationKind: 'external',
      destinationProfileId: null,
    });

    const { data, error } = await recordWalletTransfer(repo, SEND);

    expect(error).toBeNull();
    expect(data?.inserted).toBe(false);
    expect(data?.transfer.transactionHash).toBe('hash-1');
  });

  it('surfaces a create failure that is not a duplicate', async () => {
    const repo = new MemoryWalletTransferRepository();
    repo.failNextCreateWith = new Error('connection lost');

    const { data, error } = await recordWalletTransfer(repo, SEND);

    expect(data).toBeNull();
    expect(error?.message).toBe('connection lost');
  });
});
