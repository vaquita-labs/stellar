import { describe, expect, it } from 'vitest';
import {
  countExternalVaultDeposits,
  directionForFlowKind,
  isExternalVaultDeposit,
  recordVaultFlow,
  type VaultFlowKind,
  type VaultFlowRecord,
  type VaultFlowRepository,
} from './vaultFlows';

const NOW = new Date('2026-09-10T12:00:00.000Z');

/** In-memory fake: the whole service is exercised without a database. */
class MemoryVaultFlowRepository implements VaultFlowRepository {
  private rows = new Map<string, VaultFlowRecord>();
  private nextId = 1;
  /** Raised by a test to make the next `create` fail the way the unique index does. */
  failNextCreateWith: Error | null = null;
  createCalls = 0;

  async create(input: Omit<VaultFlowRecord, 'id' | 'createdAt' | 'updatedAt'>) {
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

  async countByWalletAndKind(walletAddress: string, flowKind: VaultFlowKind) {
    return [...this.rows.values()].filter((row) => row.walletAddress === walletAddress && row.flowKind === flowKind)
      .length;
  }

  /** Seeds a row the way a racing request would: written, but not through `create`. */
  seed(row: Omit<VaultFlowRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    this.rows.set(row.transactionHash, { ...row, id: String(this.nextId++), createdAt: NOW, updatedAt: NOW });
  }
}

const FLOW = {
  walletAddress: 'GABC',
  tokenId: 2,
  flowKind: 'external_in' as VaultFlowKind,
  amount: 5,
  transactionHash: 'hash-1',
  confirmedAt: NOW,
};

describe('directionForFlowKind', () => {
  it('derives the direction from the kind, so the two columns cannot disagree', () => {
    expect(directionForFlowKind('external_in')).toBe('deposit');
    expect(directionForFlowKind('internal_in')).toBe('deposit');
    expect(directionForFlowKind('external_out')).toBe('withdraw');
    expect(directionForFlowKind('internal_out')).toBe('withdraw');
  });

  it('only counts external inflows as money the user actually added', () => {
    expect(isExternalVaultDeposit('external_in')).toBe(true);
    expect(isExternalVaultDeposit('internal_in')).toBe(false);
  });
});

describe('recordVaultFlow', () => {
  it('writes the flow with the direction its kind implies', async () => {
    const repository = new MemoryVaultFlowRepository();

    const { data, error } = await recordVaultFlow(repository, FLOW);

    expect(error).toBeNull();
    expect(data?.inserted).toBe(true);
    expect(data?.flow).toMatchObject({ direction: 'deposit', flowKind: 'external_in', amount: 5 });
  });

  it('records an internal move as a withdrawal without inventing an inflow', async () => {
    const repository = new MemoryVaultFlowRepository();

    const { data } = await recordVaultFlow(repository, { ...FLOW, flowKind: 'internal_out' });

    expect(data?.flow.direction).toBe('withdraw');
    expect(isExternalVaultDeposit(data!.flow.flowKind)).toBe(false);
  });

  // The coin grant reads `inserted`, so this is the assertion that keeps a
  // client retry from paying twice.
  it('returns the existing row, not inserted, when the hash is already on file', async () => {
    const repository = new MemoryVaultFlowRepository();
    await recordVaultFlow(repository, FLOW);

    const { data, error } = await recordVaultFlow(repository, { ...FLOW, amount: 999 });

    expect(error).toBeNull();
    expect(data?.inserted).toBe(false);
    expect(data?.flow.amount).toBe(5);
    expect(repository.createCalls).toBe(1);
  });

  it('yields to the winner when two requests race into the unique index', async () => {
    const repository = new MemoryVaultFlowRepository();
    // The pre-check finds nothing, the insert loses the race: the loser has to
    // return the winner's row, not an error the client would retry forever.
    repository.failNextCreateWith = new Error('duplicate key value violates unique constraint');
    repository.seed({ ...FLOW, direction: 'deposit' });

    const { data, error } = await recordVaultFlow(repository, FLOW);

    expect(error).toBeNull();
    expect(data?.inserted).toBe(false);
    expect(data?.flow.transactionHash).toBe('hash-1');
  });

  it('reports a write that failed for any other reason', async () => {
    const repository = new MemoryVaultFlowRepository();
    repository.failNextCreateWith = new Error('connection terminated');

    const { data, error } = await recordVaultFlow(repository, FLOW);

    expect(data).toBeNull();
    expect(error?.message).toBe('connection terminated');
  });
});

describe('countExternalVaultDeposits', () => {
  it('counts external deposits for the life of the wallet and ignores internal moves', async () => {
    const repository = new MemoryVaultFlowRepository();
    await recordVaultFlow(repository, FLOW);
    await recordVaultFlow(repository, { ...FLOW, transactionHash: 'hash-2' });
    await recordVaultFlow(repository, { ...FLOW, transactionHash: 'hash-3' });
    // Moved in from a locked position: not a new deposit.
    await recordVaultFlow(repository, { ...FLOW, transactionHash: 'hash-4', flowKind: 'internal_in' });
    // Took everything back out: the lifetime count does not fall.
    await recordVaultFlow(repository, { ...FLOW, transactionHash: 'hash-5', flowKind: 'external_out' });

    const { data, error } = await countExternalVaultDeposits(repository, 'GABC');

    expect(error).toBeNull();
    expect(data).toBe(3);
  });

  it('reports zero for a wallet with no flows', async () => {
    const repository = new MemoryVaultFlowRepository();

    const { data } = await countExternalVaultDeposits(repository, 'GXYZ');

    expect(data).toBe(0);
  });
});
