import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { KpiTile } from '@/components/KpiTile';
import { RangePicker } from '@/components/RangePicker';
import { CategoryBars, TimeSeriesBars, TimeSeriesLine } from '@/components/charts';
import { fmtInt, fmtLockPeriod, fmtPct, fmtUsd } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import { byLockPeriod, depositKpis, depositSeries, topDepositors } from '@/lib/queries/deposits';
import { parseRange } from '@/lib/range';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DepositsPage({ searchParams }: Props) {
  const range = parseRange(await searchParams);
  const w = await sqlWindow(range);
  const [kpis, series, periods, top] = await Promise.all([
    depositKpis(w),
    depositSeries(w),
    byLockPeriod(w),
    topDepositors(w),
  ]);
  const prev = w.hasPrev;
  const periodRows = periods.map((p) => ({ period: fmtLockPeriod(p.lock_period_ms), ...p }));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Deposits</h1>
          <p className="text-sm text-black/60">Confirmed deposits only, amounts in USDC.</p>
        </div>
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Deposit volume"
          value={fmtUsd(kpis.volume)}
          current={kpis.volume}
          previous={prev ? kpis.volume_prev : undefined}
          hint="confirmed in range"
        />
        <KpiTile
          label="Deposits"
          value={fmtInt(kpis.count)}
          current={kpis.count}
          previous={prev ? kpis.count_prev : undefined}
          hint={`avg ticket ${fmtUsd(kpis.avg_ticket)}`}
        />
        <KpiTile
          label="Depositors"
          value={fmtInt(kpis.depositors)}
          current={kpis.depositors}
          previous={prev ? kpis.depositors_prev : undefined}
          hint="unique wallets in range"
        />
        <KpiTile
          label="Locked principal"
          value={fmtUsd(kpis.tvl)}
          hint={`${fmtInt(kpis.active_positions)} open positions now`}
        />
        <KpiTile
          label="Repeat depositors"
          value={kpis.wallets_all ? fmtPct(kpis.repeat_wallets / kpis.wallets_all) : '—'}
          hint={`${fmtInt(kpis.repeat_wallets)} of ${fmtInt(kpis.wallets_all)} wallets deposited ≥2 times (all time)`}
        />
        <KpiTile
          label="All-time volume"
          value={fmtUsd(kpis.volume_all)}
          hint={`${fmtInt(kpis.count_all)} deposits · ${fmtInt(kpis.failed)} failed / ${fmtInt(kpis.initiated)} stuck in range`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Deposit volume"
          hint={`Confirmed USDC per ${range.bucket}`}
          rows={series}
          filename={`deposit-volume-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars rows={series} series={[{ key: 'volume', label: 'Deposited', kind: 'usd' }]} />
        </ChartCard>
        <ChartCard
          title="Deposits & depositors"
          hint={`Count of confirmed deposits and unique wallets per ${range.bucket}`}
          rows={series}
          filename={`deposit-count-${range.key}-${range.bucket}`}
        >
          <TimeSeriesLine
            rows={series}
            series={[
              { key: 'deposits', label: 'Deposits' },
              { key: 'depositors', label: 'Depositors' },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Locked principal (TVL)"
          hint="Confirmed principal minus withdrawn principal, at the end of each bucket"
          rows={series}
          filename={`tvl-${range.key}-${range.bucket}`}
        >
          <TimeSeriesLine rows={series} series={[{ key: 'tvl', label: 'Locked principal', kind: 'usd' }]} />
        </ChartCard>
        <ChartCard
          title="Inflow vs outflow"
          hint={`Deposited vs withdrawn principal per ${range.bucket}`}
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
          title="Volume by lock period"
          hint="Confirmed USDC in range, by chosen lock period"
          rows={periodRows}
          filename={`lock-periods-${range.key}`}
        >
          <CategoryBars
            rows={periodRows}
            category="period"
            series={{ key: 'volume', label: 'Deposited', kind: 'usd' }}
          />
        </ChartCard>
        <DataTable
          title="Top depositors"
          hint="By confirmed volume in range"
          rows={top.map((r) => ({
            ...r,
            nickname: r.nickname ?? '—',
            wallet: `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}`,
            volume: fmtUsd(r.volume),
          }))}
          columns={[
            { key: 'nickname', label: 'Nickname' },
            { key: 'wallet', label: 'Wallet' },
            { key: 'deposits', label: 'Deposits', align: 'right' },
            { key: 'volume', label: 'Volume', align: 'right' },
            { key: 'first_deposit', label: 'First deposit' },
          ]}
          filename="top-depositors"
        />
      </div>
    </>
  );
}
