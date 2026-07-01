import { prisma } from '@vaquita/db';
import { fetchCircleCctpAttestation } from './attestation';
import type { BridgeTransferRecord, CctpAttestationResult } from './transfers';
import {
  attachBridgeDestinationTx,
  markBridgeDestinationRelayFailed,
  refreshBridgeTransfer,
  type BridgeTransferRepository,
} from './transfers';
import { prismaBridgeTransferRepository } from './prismaRepository';
import { relayStellarMintAndForward } from './stellarRelayer';

export interface BridgeConfirmationQueue {
  claimPending(limit: number, leaseMs?: number): Promise<BridgeTransferRecord[]>;
  save(row: BridgeTransferRecord): Promise<BridgeTransferRecord>;
}

export interface BridgeConfirmationBatchInput {
  queue: BridgeConfirmationQueue;
  batchSize: number;
  now?: Date;
  staleAfterMs?: number;
  getAttestation?: (row: BridgeTransferRecord) => Promise<CctpAttestationResult>;
  relayDestination?: (row: BridgeTransferRecord) => Promise<{ destinationTxHash: string }>;
}

export interface BridgeConfirmationBatchResult {
  claimed: number;
  refreshed: number;
  relayed: number;
  ready: number;
  needsReview: number;
  stale: number;
}

const repositoryForQueue = (
  queue: BridgeConfirmationQueue,
  claimedRows: Map<string, BridgeTransferRecord>,
): BridgeTransferRepository => ({
  create: async () => {
    throw new Error('Worker queue repository does not create bridge transfers');
  },
  getById: async (id) => claimedRows.get(id) ?? null,
  findBySourceTxHash: async () => null,
  listActiveForWallet: async () => [],
  listRecentCompletedForWallet: async () => [],
  update: async (id, patch) => {
    const row = claimedRows.get(id);
    if (!row) throw new Error(`Bridge transfer not found: ${id}`);
    const updated = await queue.save({ ...row, ...patch, id, updatedAt: new Date() });
    claimedRows.set(id, updated);
    return updated;
  },
});

export const runBridgeConfirmationBatch = async ({
  queue,
  batchSize,
  now = new Date(),
  staleAfterMs,
  getAttestation = fetchCircleCctpAttestation,
  relayDestination = relayStellarMintAndForward,
}: BridgeConfirmationBatchInput): Promise<BridgeConfirmationBatchResult> => {
  const claimed = await queue.claimPending(batchSize);
  const repo = repositoryForQueue(queue, new Map(claimed.map((row) => [row.id, row])));
  let refreshed = 0;
  let relayed = 0;
  let ready = 0;
  let needsReview = 0;
  let stale = 0;

  for (const transfer of claimed) {
    if (transfer.status === 'ready_to_complete') {
      try {
        const { destinationTxHash } = await relayDestination(transfer);
        const updated = await attachBridgeDestinationTx(repo, transfer.id, { destinationTxHash });
        if (updated.status === 'completed') relayed += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown relay failure';
        const updated = await markBridgeDestinationRelayFailed(repo, transfer.id, {
          errorReason: `Destination relay failed: ${reason}`,
        });
        if (updated.status === 'needs_review') needsReview += 1;
      }
      continue;
    }
    if (transfer.status !== 'attestation_pending') continue;
    if (staleAfterMs && now.getTime() - transfer.updatedAt.getTime() >= staleAfterMs) {
      const updated = await repo.update(transfer.id, {
        status: 'needs_review',
        errorReason: 'Bridge transfer exceeded stale threshold',
      });
      stale += 1;
      if (updated.status === 'needs_review') needsReview += 1;
      continue;
    }
    const updated = await refreshBridgeTransfer(repo, transfer.id, getAttestation);
    refreshed += 1;
    if (updated.status === 'ready_to_complete') ready += 1;
    if (updated.status === 'needs_review') needsReview += 1;
  }

  return { claimed: claimed.length, refreshed, relayed, ready, needsReview, stale };
};

const prismaToRecord = (row: any): BridgeTransferRecord => ({
  id: row.id,
  direction: row.direction,
  sourceNetwork: row.sourceNetwork,
  destinationNetwork: row.destinationNetwork,
  sourceWallet: row.sourceWallet,
  destinationWallet: row.destinationWallet,
  amount: row.amount,
  amountRaw: row.amountRaw,
  status: row.status,
  sourceTxHash: row.sourceTxHash ?? null,
  destinationTxHash: row.destinationTxHash ?? null,
  messageHash: row.messageHash ?? null,
  cctpMessage: row.cctpMessage ?? null,
  cctpAttestation: row.cctpAttestation ?? null,
  errorReason: row.errorReason ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const prismaBridgeConfirmationQueue: BridgeConfirmationQueue = {
  async claimPending(limit, leaseMs = 60_000) {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const rows = await prisma.bridgeTransfer.findMany({
      where: {
        deletedAt: null,
        status: { in: ['attestation_pending', 'ready_to_complete'] },
        OR: [
          { processingLeaseUntil: null },
          { processingLeaseUntil: { lt: now } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    const claimed: BridgeTransferRecord[] = [];
    for (const row of rows) {
      const updated = await prisma.bridgeTransfer.update({
        where: { id: row.id },
        data: {
          processingLeaseUntil: leaseUntil,
          lastPolledAt: now,
          retryCount: { increment: 1 },
        },
      });
      claimed.push(prismaToRecord(updated));
    }
    return claimed;
  },

  async save(row) {
    await prismaBridgeTransferRepository.update(row.id, {
      status: row.status,
      destinationTxHash: row.destinationTxHash ?? null,
      cctpMessage: row.cctpMessage ?? null,
      cctpAttestation: row.cctpAttestation ?? null,
      errorReason: row.errorReason ?? null,
    });
    const updated = await prisma.bridgeTransfer.update({
      where: { id: row.id },
      data: { processingLeaseUntil: null },
    });
    return prismaToRecord(updated);
  },
};
