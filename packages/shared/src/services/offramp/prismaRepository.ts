import { prisma } from '@vaquita/db';
import type {
  OfframpStep,
  OfframpWithdrawalRecord,
  OfframpWithdrawalRepository,
  OfframpWithdrawalStatus,
} from './withdrawals';

const toRecord = (row: {
  id: string;
  walletAddress: string;
  providerTxId: string | null;
  provider: string | null;
  country: string;
  rail: string | null;
  amountFiat: string;
  currency: string;
  usdcAmount: string | null;
  vaultWithdrawHash: string | null;
  paymentHash: string | null;
  step: string;
  status: string;
  errorReason: string | null;
  lastPolledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): OfframpWithdrawalRecord => ({
  id: row.id,
  walletAddress: row.walletAddress,
  providerTxId: row.providerTxId,
  provider: row.provider,
  country: row.country,
  rail: row.rail,
  amountFiat: row.amountFiat,
  currency: row.currency,
  usdcAmount: row.usdcAmount,
  vaultWithdrawHash: row.vaultWithdrawHash,
  paymentHash: row.paymentHash,
  step: row.step as OfframpStep,
  status: row.status as OfframpWithdrawalStatus,
  errorReason: row.errorReason,
  lastPolledAt: row.lastPolledAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const prismaOfframpWithdrawalRepository: OfframpWithdrawalRepository = {
  async create(input) {
    const row = await prisma.offrampWithdrawal.create({ data: input });
    return toRecord(row);
  },

  async getById(id) {
    const row = await prisma.offrampWithdrawal.findFirst({ where: { id, deletedAt: null } });
    return row ? toRecord(row) : null;
  },

  async findOpenForWallet(walletAddress) {
    // El más reciente y nada más: dos retiros abiertos a la vez no deberían
    // existir, y si existieran el viejo no es el que el usuario está mirando.
    const row = await prisma.offrampWithdrawal.findFirst({
      where: { walletAddress, deletedAt: null, status: 'pending' },
      orderBy: { updatedAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  },

  async update(id, patch) {
    const row = await prisma.offrampWithdrawal.update({ where: { id }, data: patch });
    return toRecord(row);
  },
};
