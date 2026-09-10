import { prisma } from '@vaquita/db';
import type {
  VaultFlowDirection,
  VaultFlowKind,
  VaultFlowRecord,
  VaultFlowRepository,
} from './vaultFlows';

/**
 * `amount` is `Decimal` in Postgres for the same reason `deposits.amount` is —
 * the dashboard sums it — and a plain number out here for the same reason every
 * other service exposes one: nothing downstream does decimal arithmetic on a
 * USDC figure, and a Decimal instance does not survive `res.json`.
 */
const toRecord = (row: {
  id: string;
  walletAddress: string;
  tokenId: number;
  direction: string;
  flowKind: string;
  amount: { toString(): string };
  transactionHash: string;
  confirmedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): VaultFlowRecord => ({
  id: row.id,
  walletAddress: row.walletAddress,
  tokenId: row.tokenId,
  direction: row.direction as VaultFlowDirection,
  flowKind: row.flowKind as VaultFlowKind,
  amount: Number(row.amount.toString()),
  transactionHash: row.transactionHash,
  confirmedAt: row.confirmedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const prismaVaultFlowRepository: VaultFlowRepository = {
  async create(input) {
    const row = await prisma.vaultFlow.create({ data: input });
    return toRecord(row);
  },

  // Soft-deleted rows are excluded from every read, so a row an admin retracted
  // stops counting — but the hash lookup that guards the insert reads them too
  // through the unique index, which is a deliberate asymmetry: retracting a row
  // must not let the same transaction be recorded, and paid for, a second time.
  async findByTransactionHash(transactionHash) {
    const row = await prisma.vaultFlow.findFirst({ where: { transactionHash } });
    return row ? toRecord(row) : null;
  },

  async countByWalletAndKind(walletAddress, flowKind) {
    return prisma.vaultFlow.count({ where: { walletAddress, flowKind, deletedAt: null } });
  },
};
