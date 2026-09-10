import { ChartCard } from '@/components/ChartCard';
import { CohortGrid } from '@/components/CohortGrid';
import { KpiTile } from '@/components/KpiTile';
import { RangePicker } from '@/components/RangePicker';
import { TimeSeriesBars } from '@/components/charts';
import { fmtInt, fmtPct, fmtUsd } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import { depositCohorts, retentionKpis, withdrawalSeries } from '@/lib/queries/retention';
import { parseRange } from '@/lib/range';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RetentionPage({ searchParams }: Props) {
  const range = parseRange(await searchParams);
  const w = await sqlWindow(range);
  const [kpis, cohorts, withdrawals] = await Promise.all([retentionKpis(w), depositCohorts(w), withdrawalSeries(w)]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Retention</h1>
          <p className="text-sm text-black/60">
            Do users come back, and do they hold to maturity? Deposit figures count both products; withdrawal and
            maturity figures are locked positions only, since the flexible vault has neither a lock nor a maturity.
          </p>
        </div>
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Returning depositors"
          value={kpis.depositors ? fmtPct(kpis.returning_depositors / kpis.depositors) : '—'}
          hint={`${fmtInt(kpis.returning_depositors)} of ${fmtInt(kpis.depositors)} wallets deposited ≥2× in range`}
        />
        <KpiTile
          label="Early locked withdrawals"
          value={kpis.withdrawals ? fmtPct(kpis.early / kpis.withdrawals) : '—'}
          hint={`${fmtInt(kpis.early)} of ${fmtInt(kpis.withdrawals)} withdrawals before lock end`}
        />
        <KpiTile
          label="Locked principal withdrawn"
          value={fmtUsd(kpis.principal_withdrawn)}
          hint="confirmed pool withdrawals in range"
        />
        <KpiTile
          label="Yield paid out"
          value={fmtUsd(kpis.interest_paid + kpis.reward_paid)}
          hint={`interest ${fmtUsd(kpis.interest_paid)} + rewards ${fmtUsd(kpis.reward_paid)}`}
        />
        <KpiTile
          label="Open locked positions"
          value={fmtInt(kpis.active_positions)}
          hint={`${fmtInt(kpis.matured_unclaimed)} matured but not withdrawn`}
        />
        <KpiTile
          label="Time to 1st deposit"
          value={kpis.median_days_to_first_deposit == null ? '—' : `${kpis.median_days_to_first_deposit.toFixed(1)}d`}
          hint="median days from signup, new users in range"
        />
      </div>

      <CohortGrid cells={cohorts} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Locked withdrawals: early vs on time"
          hint={`Confirmed pool withdrawals per ${range.bucket}`}
          rows={withdrawals}
          filename={`withdrawals-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={withdrawals}
            series={[
              { key: 'on_time', label: 'On time' },
              { key: 'early', label: 'Early' },
            ]}
            stacked
          />
        </ChartCard>
        <ChartCard
          title="Locked principal withdrawn"
          hint={`Pool USDC returned per ${range.bucket}, early vs on time`}
          rows={withdrawals}
          filename={`withdrawn-principal-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={withdrawals}
            series={[
              { key: 'on_time_principal', label: 'On time', kind: 'usd' },
              { key: 'early_principal', label: 'Early', kind: 'usd' },
            ]}
            stacked
          />
        </ChartCard>
      </div>
    </>
  );
}
