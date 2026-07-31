import { prisma } from '@vaquita/db';

export interface VaquitaPosition {
  /** Lock period, as stored on the deposit (raw lock_period value). */
  period: number;
  /** Summed principal for that period, in USDC. */
  amount: number;
}

/**
 * The wallets' active locked Vaquita-pool deposits, grouped by lock period, from
 * the deposits table (status=confirmed, no confirmed withdrawal). One query for
 * the whole batch. Returns [] for wallets with no active locked position.
 */
export async function getVaquitaPositionsByWallet(wallets: string[]): Promise<Map<string, VaquitaPosition[]>> {
  const out = new Map<string, VaquitaPosition[]>();
  if (!wallets.length) return out;

  const deposits = await prisma.deposit.findMany({
    where: { walletAddress: { in: wallets }, deletedAt: null, status: 'confirmed' },
    select: {
      walletAddress: true,
      amount: true,
      lockPeriod: true,
      withdrawals: { select: { status: true } },
    },
  });

  const byWallet = new Map<string, Map<number, number>>();
  for (const d of deposits) {
    if (d.withdrawals.some((w) => w.status === 'confirmed')) continue;
    const period = d.lockPeriod != null ? Number(d.lockPeriod) : 0;
    const perPeriod = byWallet.get(d.walletAddress) ?? new Map<number, number>();
    perPeriod.set(period, (perPeriod.get(period) ?? 0) + d.amount.toNumber());
    byWallet.set(d.walletAddress, perPeriod);
  }

  for (const [wallet, perPeriod] of byWallet) {
    out.set(
      wallet,
      Array.from(perPeriod.entries())
        .map(([period, amount]) => ({ period, amount }))
        .sort((a, b) => a.period - b.period),
    );
  }
  return out;
}
