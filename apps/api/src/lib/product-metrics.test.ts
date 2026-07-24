import { describe, expect, it } from 'vitest';
import { renderMetrics } from './metrics';
import {
  computeProductStats,
  refreshProductMetrics,
  setProductStats,
  type ProductStatsBadgeClaim,
  type ProductStatsDeposit,
  type ProductStatsRepository,
  type ProductStatsWithdrawal,
} from './product-metrics';

const metricValue = (exposition: string, name: string): number => {
  const match = exposition.match(new RegExp(`^${name} (\\d+(?:\\.\\d+)?)$`, 'm'));
  return match ? Number(match[1]) : 0;
};

const fakeRepo = (data: {
  deposits?: ProductStatsDeposit[];
  withdrawals?: ProductStatsWithdrawal[];
  badges?: ProductStatsBadgeClaim[];
}): ProductStatsRepository => ({
  fetchDeposits: async () => data.deposits ?? [],
  fetchWithdrawals: async () => data.withdrawals ?? [],
  fetchBadgeClaims: async () => data.badges ?? [],
});

const deposit = (over: Partial<ProductStatsDeposit>): ProductStatsDeposit => ({
  id: 1,
  walletAddress: 'GA',
  amount: 100,
  status: 'confirmed',
  ...over,
});

const withdrawal = (over: Partial<ProductStatsWithdrawal>): ProductStatsWithdrawal => ({
  depositId: 1,
  status: 'confirmed',
  ...over,
});

const badge = (over: Partial<ProductStatsBadgeClaim>): ProductStatsBadgeClaim => ({
  walletAddress: 'GA',
  confirmedAt: new Date('2026-07-01T00:00:00Z'),
  ...over,
});

describe('computeProductStats — pool TVL', () => {
  it('sums confirmed, non-withdrawn deposit amounts and excludes withdrawn and unconfirmed', () => {
    const stats = computeProductStats(
      [
        deposit({ id: 1, amount: 500, status: 'confirmed' }), // active → counts
        deposit({ id: 2, amount: 300, status: 'confirmed' }), // withdrawn → excluded
        deposit({ id: 3, amount: 999, status: 'initiated' }), // unconfirmed → excluded
      ],
      [withdrawal({ depositId: 2, status: 'confirmed' })],
      [],
    );

    expect(stats.poolTvlUsdc).toBe(500);
  });
});

describe('computeProductStats — pool volume, counts, positions, wallets', () => {
  it('counts confirmed deposits/withdrawals, cumulative volume, active positions and unique wallets', () => {
    const stats = computeProductStats(
      [
        deposit({ id: 1, walletAddress: 'GA', amount: 500, status: 'confirmed' }), // active
        deposit({ id: 2, walletAddress: 'GA', amount: 300, status: 'confirmed' }), // withdrawn
        deposit({ id: 3, walletAddress: 'GB', amount: 200, status: 'confirmed' }), // active
        deposit({ id: 4, walletAddress: 'GC', amount: 999, status: 'failed' }), // excluded
      ],
      [
        withdrawal({ depositId: 2, status: 'confirmed' }),
        withdrawal({ depositId: 3, status: 'initiated' }), // not confirmed → deposit 3 stays active
      ],
      [],
    );

    // volume includes withdrawn but not unconfirmed: 500 + 300 + 200
    expect(stats.poolDepositVolumeUsdc).toBe(1000);
    expect(stats.poolDepositsTotal).toBe(3);
    expect(stats.poolWithdrawalsTotal).toBe(1);
    expect(stats.poolActivePositions).toBe(2); // deposits 1 and 3
    expect(stats.poolUniqueWallets).toBe(2); // GA, GB
  });
});

describe('computeProductStats — badges', () => {
  it('counts only confirmed on-chain mints and distinct minters, ignoring unminted claims', () => {
    const stats = computeProductStats(
      [],
      [],
      [
        badge({ walletAddress: 'GA', confirmedAt: new Date('2026-07-01T00:00:00Z') }), // minted
        badge({ walletAddress: 'GA', confirmedAt: new Date('2026-07-02T00:00:00Z') }), // minted, same wallet
        badge({ walletAddress: 'GB', confirmedAt: new Date('2026-07-03T00:00:00Z') }), // minted
        badge({ walletAddress: 'GC', confirmedAt: null }), // claimed but not minted → excluded
      ],
    );

    expect(stats.badgesMintedTotal).toBe(3);
    expect(stats.badgesUniqueMinters).toBe(2); // GA, GB
  });
});

describe('setProductStats', () => {
  it('writes all eight product gauges into the registry exposition', async () => {
    setProductStats({
      poolTvlUsdc: 1523.44,
      poolDepositVolumeUsdc: 4200,
      poolDepositsTotal: 12,
      poolWithdrawalsTotal: 3,
      poolActivePositions: 9,
      poolUniqueWallets: 7,
      badgesMintedTotal: 5,
      badgesUniqueMinters: 4,
    });

    const output = await renderMetrics();
    expect(output).toContain('vaquita_pool_tvl_usdc 1523.44');
    expect(output).toContain('vaquita_pool_deposit_volume_usdc 4200');
    expect(output).toContain('vaquita_pool_deposits_total 12');
    expect(output).toContain('vaquita_pool_withdrawals_total 3');
    expect(output).toContain('vaquita_pool_active_positions 9');
    expect(output).toContain('vaquita_pool_unique_wallets 7');
    expect(output).toContain('vaquita_badges_minted_total 5');
    expect(output).toContain('vaquita_badges_unique_minters 4');
  });
});

describe('refreshProductMetrics', () => {
  it('fetches, computes and publishes gauges on success', async () => {
    await refreshProductMetrics(
      fakeRepo({ deposits: [deposit({ id: 1, amount: 250, status: 'confirmed', walletAddress: 'GX' })] }),
    );

    expect(await renderMetrics()).toContain('vaquita_pool_tvl_usdc 250');
  });

  it('increments the failure counter and keeps last-good values when a fetch throws', async () => {
    await refreshProductMetrics(
      fakeRepo({ deposits: [deposit({ id: 2, amount: 777, status: 'confirmed', walletAddress: 'GY' })] }),
    );

    const failuresBefore = metricValue(
      await renderMetrics(),
      'vaquita_pool_stats_refresh_failures_total',
    );

    const throwingRepo: ProductStatsRepository = {
      fetchDeposits: async () => {
        throw new Error('db down');
      },
      fetchWithdrawals: async () => [],
      fetchBadgeClaims: async () => [],
    };
    await refreshProductMetrics(throwingRepo);

    const after = await renderMetrics();
    expect(metricValue(after, 'vaquita_pool_stats_refresh_failures_total')).toBe(failuresBefore + 1);
    expect(after).toContain('vaquita_pool_tvl_usdc 777');
  });
});
