import { prisma } from '@vaquita/db';
import type { OnrampPurchaseRecord, OnrampPurchaseRepository, OnrampPurchaseStatus } from './purchases';

const toRecord = (row: {
  id: string;
  walletAddress: string;
  providerTxId: string;
  provider: string;
  country: string;
  amountFiat: string;
  currency: string;
  status: string;
  expiresAt: Date | null;
  lastPolledAt: Date | null;
  errorReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OnrampPurchaseRecord => ({
  id: row.id,
  walletAddress: row.walletAddress,
  providerTxId: row.providerTxId,
  provider: row.provider,
  country: row.country,
  amountFiat: row.amountFiat,
  currency: row.currency,
  status: row.status as OnrampPurchaseStatus,
  expiresAt: row.expiresAt,
  lastPolledAt: row.lastPolledAt,
  errorReason: row.errorReason,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const prismaOnrampPurchaseRepository: OnrampPurchaseRepository = {
  async create(input) {
    const row = await prisma.onrampPurchase.create({ data: input });
    return toRecord(row);
  },

  async getById(id) {
    const row = await prisma.onrampPurchase.findFirst({ where: { id, deletedAt: null } });
    return row ? toRecord(row) : null;
  },

  async findOpenForWallet(walletAddress) {
    // La más reciente y nada más: dos compras abiertas a la vez no deberían
    // existir, y si existieran la vieja no es la que el usuario está mirando.
    const row = await prisma.onrampPurchase.findFirst({
      where: { walletAddress, deletedAt: null, status: { in: ['pending', 'paid'] } },
      orderBy: { updatedAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  },

  async update(id, patch) {
    const row = await prisma.onrampPurchase.update({ where: { id }, data: patch });
    return toRecord(row);
  },
};
