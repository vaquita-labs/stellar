import { prisma } from '@vaquita/db';

export interface VaquitaPosition {
  /** Lock period, as stored on the deposit (raw lock_period value). */
  period: number;
  /** Summed principal for that period, in USDC. */
  amount: number;
}

/** Snapshot/positions key — never mix token ids, even on the same contract. */
export const positionKey = (wallet: string, tokenId: number) => `${wallet}|${tokenId}`;

/**
 * Active locked Vaquita-pool deposits for the given wallets, grouped by lock
 * period AND token id, from the deposits table (status=confirmed, no confirmed
 * withdrawal). One query for the whole set. Keyed by `${wallet}|${tokenId}`.
 */
export async function getVaquitaPositionsByWalletToken(
  wallets: string[],
): Promise<Map<string, VaquitaPosition[]>> {
  const out = new Map<string, VaquitaPosition[]>();
  if (!wallets.length) return out;

  const deposits = await prisma.deposit.findMany({
    where: { walletAddress: { in: wallets }, deletedAt: null, status: 'confirmed' },
    select: {
      walletAddress: true,
      tokenId: true,
      amount: true,
      lockPeriod: true,
      withdrawals: { select: { status: true } },
    },
  });

  const grouped = new Map<string, Map<number, number>>();
  for (const d of deposits) {
    if (d.withdrawals.some((w) => w.status === 'confirmed')) continue;
    const key = positionKey(d.walletAddress, d.tokenId);
    const period = d.lockPeriod != null ? Number(d.lockPeriod) : 0;
    const perPeriod = grouped.get(key) ?? new Map<number, number>();
    perPeriod.set(period, (perPeriod.get(period) ?? 0) + d.amount.toNumber());
    grouped.set(key, perPeriod);
  }

  for (const [key, perPeriod] of grouped) {
    out.set(
      key,
      Array.from(perPeriod.entries())
        .map(([period, amount]) => ({ period, amount }))
        .sort((a, b) => a.period - b.period),
    );
  }
  return out;
}
