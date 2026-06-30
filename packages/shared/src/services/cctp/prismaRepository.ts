import { prisma } from '@vaquita/db';
import type {
  BridgeDirection,
  BridgeTransferRecord,
  BridgeTransferRepository,
  BridgeTransferStatus,
} from './transfers';

const toRecord = (row: any): BridgeTransferRecord => ({
  id: row.id,
  direction: row.direction as BridgeDirection,
  sourceNetwork: row.sourceNetwork,
  destinationNetwork: row.destinationNetwork,
  sourceWallet: row.sourceWallet,
  destinationWallet: row.destinationWallet,
  amount: row.amount,
  amountRaw: row.amountRaw,
  status: row.status as BridgeTransferStatus,
  sourceTxHash: row.sourceTxHash ?? null,
  destinationTxHash: row.destinationTxHash ?? null,
  messageHash: row.messageHash ?? null,
  cctpMessage: row.cctpMessage ?? null,
  cctpAttestation: row.cctpAttestation ?? null,
  errorReason: row.errorReason ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const activeStatuses: BridgeTransferStatus[] = [
  'source_awaiting_signature',
  'source_confirming',
  'attestation_pending',
  'ready_to_complete',
  'destination_awaiting_signature',
  'destination_confirming',
  'needs_review',
];

export const prismaBridgeTransferRepository: BridgeTransferRepository = {
  async create(input) {
    const row = await prisma.bridgeTransfer.create({ data: input });
    return toRecord(row);
  },

  async getById(id) {
    const row = await prisma.bridgeTransfer.findFirst({ where: { id, deletedAt: null } });
    return row ? toRecord(row) : null;
  },

  async findBySourceTxHash(sourceTxHash) {
    const row = await prisma.bridgeTransfer.findFirst({
      where: { sourceTxHash, deletedAt: null },
    });
    return row ? toRecord(row) : null;
  },

  async listActiveForWallet(walletAddress) {
    const row = await prisma.bridgeTransfer.findMany({
      where: {
        deletedAt: null,
        status: { in: activeStatuses },
        OR: [{ sourceWallet: walletAddress }, { destinationWallet: walletAddress }],
      },
      orderBy: { updatedAt: 'desc' },
    });
    return row.map(toRecord);
  },

  async update(id, patch) {
    const row = await prisma.bridgeTransfer.update({
      where: { id },
      data: patch,
    });
    return toRecord(row);
  },
};
