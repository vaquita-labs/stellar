import { prisma } from '@vaquita/shared';
import { Counter, Gauge } from 'prom-client';
import { logger } from './logger';
import { register } from './metrics';

const CONFIRMED = 'confirmed';

// DB-derived product gauges. The contract is namespaced by the metric name
// (vaquita_pool_* / vaquita_badges_*); no per-series contract/wallet label is
// added. Valuation is 1 USDC = 1 USD.
const poolTvlUsdc = new Gauge({
  name: 'vaquita_pool_tvl_usdc',
  help: 'Active principal locked in the pool in USDC (confirmed, not-yet-withdrawn deposits).',
  registers: [register],
});
const poolDepositVolumeUsdc = new Gauge({
  name: 'vaquita_pool_deposit_volume_usdc',
  help: 'Cumulative confirmed deposit volume in USDC, all-time (includes since-withdrawn).',
  registers: [register],
});
const poolDepositsTotal = new Gauge({
  name: 'vaquita_pool_deposits_total',
  help: 'Count of confirmed deposits (cumulative).',
  registers: [register],
});
const poolWithdrawalsTotal = new Gauge({
  name: 'vaquita_pool_withdrawals_total',
  help: 'Count of confirmed withdrawals (cumulative).',
  registers: [register],
});
const poolActivePositions = new Gauge({
  name: 'vaquita_pool_active_positions',
  help: 'Confirmed deposits not yet withdrawn.',
  registers: [register],
});
const poolUniqueWallets = new Gauge({
  name: 'vaquita_pool_unique_wallets',
  help: 'Distinct wallets with a confirmed deposit.',
  registers: [register],
});
const badgesMintedTotal = new Gauge({
  name: 'vaquita_badges_minted_total',
  help: 'Confirmed on-chain badge mints.',
  registers: [register],
});
const badgesUniqueMinters = new Gauge({
  name: 'vaquita_badges_unique_minters',
  help: 'Distinct wallets holding a minted badge.',
  registers: [register],
});
const statsRefreshFailuresTotal = new Counter({
  name: 'vaquita_pool_stats_refresh_failures_total',
  help: 'Total failed product-stats collector refreshes (last-good values are kept).',
  registers: [register],
});

export interface ProductStatsDeposit {
  id: number;
  walletAddress: string;
  amount: number;
  status: string;
}

export interface ProductStatsWithdrawal {
  depositId: number;
  status: string;
}

export interface ProductStatsBadgeClaim {
  walletAddress: string;
  confirmedAt: Date | null;
}

export interface ProductStats {
  poolTvlUsdc: number;
  poolDepositVolumeUsdc: number;
  poolDepositsTotal: number;
  poolWithdrawalsTotal: number;
  poolActivePositions: number;
  poolUniqueWallets: number;
  badgesMintedTotal: number;
  badgesUniqueMinters: number;
}

export const computeProductStats = (
  deposits: ProductStatsDeposit[],
  withdrawals: ProductStatsWithdrawal[],
  badgeClaims: ProductStatsBadgeClaim[],
): ProductStats => {
  const confirmedDeposits = deposits.filter((d) => d.status === CONFIRMED);
  const confirmedWithdrawals = withdrawals.filter((w) => w.status === CONFIRMED);
  const withdrawnDepositIds = new Set(confirmedWithdrawals.map((w) => w.depositId));
  const activeDeposits = confirmedDeposits.filter((d) => !withdrawnDepositIds.has(d.id));
  const mintedBadges = badgeClaims.filter((b) => b.confirmedAt != null);

  return {
    poolTvlUsdc: activeDeposits.reduce((sum, d) => sum + d.amount, 0),
    poolDepositVolumeUsdc: confirmedDeposits.reduce((sum, d) => sum + d.amount, 0),
    poolDepositsTotal: confirmedDeposits.length,
    poolWithdrawalsTotal: confirmedWithdrawals.length,
    poolActivePositions: activeDeposits.length,
    poolUniqueWallets: new Set(confirmedDeposits.map((d) => d.walletAddress)).size,
    badgesMintedTotal: mintedBadges.length,
    badgesUniqueMinters: new Set(mintedBadges.map((b) => b.walletAddress)).size,
  };
};

export interface ProductStatsRepository {
  fetchDeposits(): Promise<ProductStatsDeposit[]>;
  fetchWithdrawals(): Promise<ProductStatsWithdrawal[]>;
  fetchBadgeClaims(): Promise<ProductStatsBadgeClaim[]>;
}

// Fetch → compute → publish. On any failure the previous gauge values are kept
// (serve-last-good) and the failure counter is incremented, so a transient DB
// blip surfaces as a metric rather than zeroing the dashboard.
export const refreshProductMetrics = async (repo: ProductStatsRepository): Promise<void> => {
  try {
    const [deposits, withdrawals, badgeClaims] = await Promise.all([
      repo.fetchDeposits(),
      repo.fetchWithdrawals(),
      repo.fetchBadgeClaims(),
    ]);
    setProductStats(computeProductStats(deposits, withdrawals, badgeClaims));
  } catch (err) {
    statsRefreshFailuresTotal.inc();
    logger.error({ err }, 'product-metrics refresh failed; keeping last-good gauge values');
  }
};

// Prisma-backed repository. Soft-deleted rows are excluded; the status/mint
// filtering lives in computeProductStats so it stays unit-testable.
export const createPrismaProductStatsRepository = (): ProductStatsRepository => ({
  fetchDeposits: async () => {
    const rows = await prisma.deposit.findMany({
      where: { deletedAt: null },
      select: { id: true, walletAddress: true, amount: true, status: true },
    });
    return rows.map((r) => ({
      id: r.id,
      walletAddress: r.walletAddress,
      amount: Number(r.amount),
      status: r.status,
    }));
  },
  fetchWithdrawals: async () => {
    const rows = await prisma.withdrawal.findMany({
      where: { deletedAt: null },
      select: { depositId: true, status: true },
    });
    return rows.map((r) => ({ depositId: r.depositId, status: r.status }));
  },
  fetchBadgeClaims: async () => {
    const rows = await prisma.badgeClaim.findMany({
      where: { deletedAt: null },
      select: { walletAddress: true, confirmedAt: true },
    });
    return rows.map((r) => ({ walletAddress: r.walletAddress, confirmedAt: r.confirmedAt }));
  },
});

// Kicks off an immediate refresh, then repeats on the interval. Returns the
// timer so callers can clear it; the timer is unref'd so it never keeps the
// process alive on its own.
export const startProductMetricsCollector = (
  repo: ProductStatsRepository,
  intervalMs: number,
): NodeJS.Timeout => {
  void refreshProductMetrics(repo);
  const timer = setInterval(() => void refreshProductMetrics(repo), intervalMs);
  timer.unref?.();
  return timer;
};

export const setProductStats = (stats: ProductStats): void => {
  poolTvlUsdc.set(stats.poolTvlUsdc);
  poolDepositVolumeUsdc.set(stats.poolDepositVolumeUsdc);
  poolDepositsTotal.set(stats.poolDepositsTotal);
  poolWithdrawalsTotal.set(stats.poolWithdrawalsTotal);
  poolActivePositions.set(stats.poolActivePositions);
  poolUniqueWallets.set(stats.poolUniqueWallets);
  badgesMintedTotal.set(stats.badgesMintedTotal);
  badgesUniqueMinters.set(stats.badgesUniqueMinters);
};
