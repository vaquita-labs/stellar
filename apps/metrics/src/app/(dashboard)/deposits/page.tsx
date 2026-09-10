import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { KpiTile } from '@/components/KpiTile';
import { RangePicker } from '@/components/RangePicker';
import { CategoryBars, TimeSeriesBars, TimeSeriesLine } from '@/components/charts';
import { fmtInt, fmtLockPeriod, fmtPct, fmtUsd } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import { Pager } from '@/components/Pager';
import { byLockPeriod, depositKpis, depositSeries, depositorsPage } from '@/lib/queries/deposits';
import { sampleAge, vaultTvl } from '@/lib/queries/vault';
import { parsePage } from '@/lib/range';
import { resolveRange } from '@/lib/rangePrefs';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DepositsPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = await resolveRange(params);
  const page = parsePage(params);
  const w = await sqlWindow(range);
  const [kpis, series, periods, depositors, vault] = await Promise.all([
    depositKpis(w),
    depositSeries(w),
    byLockPeriod(w),
    depositorsPage(w, { limit: page.limit, offset: page.offset }),
    vaultTvl(w),
  ]);
  const prev = w.hasPrev;
  // A null period is the flexible vault: there is no lock to name.
  const periodRows = periods.map((p) => ({
    period: p.lock_period_ms == null ? 'Flexible' : fmtLockPeriod(p.lock_period_ms),
    ...p,
  }));
  // Both series come from the same `generate_series`, so the buckets line up by
  // index; joining by label anyway keeps that an assumption we do not depend on.
  const vaultByBucket = new Map(vault?.series.map((r) => [r.bucket, r.vault_tvl]) ?? []);
  const tvlRows = series.map((r) => ({ ...r, vault_tvl: vaultByBucket.get(r.bucket) ?? null }));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Deposits</h1>
          <p className="text-sm text-black/60">
            Confirmed deposits only, amounts in USDC. Tiles marked &ldquo;locked&rdquo; count pool positions alone; the
            flexible vault has no lock period and no maturity.
          </p>
        </div>
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Locked deposit volume"
          value={fmtUsd(kpis.volume)}
          current={kpis.volume}
          previous={prev ? kpis.volume_prev : undefined}
          hint="confirmed in range"
        />
        <KpiTile
          label="Locked deposits"
          value={fmtInt(kpis.count)}
          current={kpis.count}
          previous={prev ? kpis.count_prev : undefined}
          hint={`avg ticket ${fmtUsd(kpis.avg_ticket)}`}
        />
        <KpiTile
          label="Locked depositors"
          value={fmtInt(kpis.depositors)}
          current={kpis.depositors}
          previous={prev ? kpis.depositors_prev : undefined}
          hint="unique wallets in range"
        />
        {/* Vault TVL is the headline number when we have it: the ledger figure
            counts principal only, so it reads low by whatever the vault earned. */}
        {vault ? (
          <KpiTile
            label="Vault TVL"
            value={fmtUsd(vault.current)}
            hint={`read ${sampleAge(vault.fetchedAt)} · ${fmtUsd(kpis.tvl)} locked principal`}
          />
        ) : (
          <KpiTile
            label="Locked principal"
            value={fmtUsd(kpis.tvl)}
            hint={`${fmtInt(kpis.active_positions)} open positions now`}
          />
        )}
        <KpiTile
          label="Repeat locked depositors"
          value={kpis.wallets_all ? fmtPct(kpis.repeat_wallets / kpis.wallets_all) : '—'}
          hint={`${fmtInt(kpis.repeat_wallets)} of ${fmtInt(kpis.wallets_all)} wallets locked ≥2 times (all time)`}
        />
        <KpiTile
          label="All-time locked volume"
          value={fmtUsd(kpis.volume_all)}
          hint={`${fmtInt(kpis.count_all)} locked deposits · ${fmtInt(kpis.failed)} failed / ${fmtInt(kpis.initiated)} stuck in range`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Locked deposit volume"
          hint={`Confirmed USDC into pool periods per ${range.bucket}`}
          rows={series}
          filename={`deposit-volume-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars rows={series} series={[{ key: 'volume', label: 'Deposited', kind: 'usd' }]} />
        </ChartCard>
        <ChartCard
          title="Locked deposits & depositors"
          hint={`Count of confirmed pool deposits and unique wallets per ${range.bucket}`}
          rows={series}
          filename={`deposit-count-${range.key}-${range.bucket}`}
        >
          <TimeSeriesLine
            rows={series}
            series={[
              { key: 'deposits', label: 'Locked deposits' },
              { key: 'depositors', label: 'Locked depositors' },
            ]}
          />
        </ChartCard>
        <ChartCard
          title={vault ? 'TVL' : 'Locked principal (TVL)'}
          hint={
            vault
              ? 'DeFindex vault total vs. the deposits ledger — the gap is accrued yield and flexible balances'
              : 'Confirmed principal minus withdrawn principal, at the end of each bucket'
          }
          rows={tvlRows}
          filename={`tvl-${range.key}-${range.bucket}`}
        >
          <TimeSeriesLine
            rows={tvlRows}
            series={
              vault
                ? [
                    { key: 'vault_tvl', label: 'Vault TVL', kind: 'usd' },
                    { key: 'tvl', label: 'Locked principal', kind: 'usd' },
                  ]
                : [{ key: 'tvl', label: 'Locked principal', kind: 'usd' }]
            }
          />
        </ChartCard>
        <ChartCard
          title="Locked inflow vs outflow"
          hint={`Pool principal deposited vs withdrawn per ${range.bucket}`}
          rows={series}
          filename={`flows-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={series}
            series={[
              { key: 'volume', label: 'Deposited', kind: 'usd' },
              { key: 'withdrawn', label: 'Withdrawn', kind: 'usd' },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Volume by product"
          hint="Confirmed USDC in range, by chosen lock period. Flexible is the vault, which has no lock."
          rows={periodRows}
          filename={`volume-by-product-${range.key}`}
        >
          <CategoryBars
            rows={periodRows}
            category="period"
            series={{ key: 'volume', label: 'Deposited', kind: 'usd' }}
          />
        </ChartCard>
        <DataTable
          title="Depositors"
          hint="Vault balance and locked principal per wallet, ranked by total. The vault column is a snapshot — see Last read."
          rows={depositors.rows.map((r) => ({
            nickname: r.nickname ?? '—',
            wallet: `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}`,
            vault: fmtUsd(r.vault),
            periods: fmtUsd(r.periods),
            total: fmtUsd(r.total),
            deposits: r.deposits,
            first_deposit: r.first_deposit ?? '—',
            scraped_at: r.scraped_at ? sampleAge(r.scraped_at) : 'never',
          }))}
          columns={[
            { key: 'nickname', label: 'Nickname' },
            { key: 'wallet', label: 'Wallet' },
            { key: 'vault', label: 'Vault', align: 'right' },
            { key: 'periods', label: 'Periods', align: 'right' },
            { key: 'total', label: 'Total', align: 'right' },
            { key: 'deposits', label: 'Locked deposits', align: 'right' },
            { key: 'first_deposit', label: 'First deposit' },
            { key: 'scraped_at', label: 'Last read', align: 'right' },
          ]}
          filename={`depositors-${range.key}-p${page.page}`}
          footer={
            <Pager
              page={page.page}
              limit={page.limit}
              total={depositors.total}
              params={{ range: range.key, bucket: range.bucket, limit: String(page.limit) }}
            />
          }
        />
      </div>
    </>
  );
}
