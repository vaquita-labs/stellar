import { prisma } from '@vaquita/db';
import type {
  WalletTransferDestinationKind,
  WalletTransferRecord,
  WalletTransferRepository,
} from './walletTransfers';

/**
 * `amount` is `Decimal` in Postgres because the dashboard sums it, and a plain
 * number out here because nothing downstream does decimal arithmetic on a USDC
 * figure and a Decimal instance does not survive `res.json`. Same trade as
 * `prismaVaultFlowRepository`.
 */
const toRecord = (row: {
  id: string;
  walletAddress: string;
  tokenId: number;
  amount: { toString(): string };
  destinationAddress: string;
  destinationKind: string;
  destinationProfileId: number | null;
  transactionHash: string;
  confirmedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): WalletTransferRecord => ({
  id: row.id,
  walletAddress: row.walletAddress,
  tokenId: row.tokenId,
  amount: Number(row.amount.toString()),
  destinationAddress: row.destinationAddress,
  destinationKind: row.destinationKind as WalletTransferDestinationKind,
  destinationProfileId: row.destinationProfileId,
  transactionHash: row.transactionHash,
  confirmedAt: row.confirmedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const prismaWalletTransferRepository: WalletTransferRepository = {
  async create(input) {
    const row = await prisma.walletTransfer.create({ data: input });
    return toRecord(row);
  },

  // Reads soft-deleted rows too, the same deliberate asymmetry
  // `prismaVaultFlowRepository` documents: a row an admin retracted stops
  // counting in every read, but must not let the same transaction be recorded a
  // second time.
  async findByTransactionHash(transactionHash) {
    const row = await prisma.walletTransfer.findFirst({ where: { transactionHash } });
    return row ? toRecord(row) : null;
  },

  // A deleted profile is not a Vaquita user any more, so the payment is filed as
  // external — which is the honest answer: there is nobody in the app holding it.
  async findProfileIdByWalletAddress(walletAddress) {
    const profile = await prisma.profile.findFirst({
      where: { walletAddress, deletedAt: null },
      select: { id: true },
    });
    return profile?.id ?? null;
  },
};
