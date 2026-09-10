import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { KpiTile } from '@/components/KpiTile';
import { RangePicker } from '@/components/RangePicker';
import { CategoryBars, TimeSeriesBars, TimeSeriesLine } from '@/components/charts';
import { fmtInt, fmtPct, fmtUsd } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import {
  offrampCorridors,
  offrampKpis,
  offrampStuckByStep,
  onrampCorridors,
  onrampKpis,
  rampSeries,
  rampTables,
} from '@/lib/queries/ramps';
import { resolveRange } from '@/lib/rangePrefs';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const header = (
  <div>
    <h1 className="text-xl font-semibold text-black">Ramps</h1>
    <p className="text-sm text-black/60">Fiat in and fiat out: how many attempts settle, and where they stall.</p>
  </div>
);

/** Settled ÷ everything that reached a terminal state — pending attempts are still in play. */
const settleRate = (settled: number, unsettled: number) => {
  const finished = settled + unsettled;
  return finished ? fmtPct(settled / finished) : '—';
};

export default async function RampsPage({ searchParams }: Props) {
  const range = await resolveRange(await searchParams);

  // Ramp migrations are applied by hand per environment, and a missing relation
  // fails the statement at parse time — so probe before querying either table.
  const tables = await rampTables();
  if (!tables.onramp && !tables.offramp) {
    return (
      <>
        {header}
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-black/70">
          Neither <code className="rounded bg-black/5 px-1 font-mono text-xs">onramp_purchases</code> nor{' '}
          <code className="rounded bg-black/5 px-1 font-mono text-xs">offramp_withdrawals</code> exists in this
          environment yet.
        </div>
      </>
    );
  }

  const w = await sqlWindow(range);
  const [on, off, series, onCorridors, offCorridorRows, stuck] = await Promise.all([
    tables.onramp ? onrampKpis(w) : null,
    tables.offramp ? offrampKpis(w) : null,
    rampSeries(w, tables),
    tables.onramp ? onrampCorridors(w) : [],
    tables.offramp ? offrampCorridors(w) : [],
    tables.offramp ? offrampStuckByStep() : [],
  ]);
  const prev = w.hasPrev;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        {header}
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {on ? (
          <>
            <KpiTile
              label="On-ramp settled"
              value={fmtInt(on.settled)}
              current={on.settled}
              previous={prev ? on.settled_prev : undefined}
              hint={`${fmtInt(on.wallets)} wallets · ${fmtInt(on.settled_all)} all time`}
            />
            <KpiTile
              label="On-ramp settle rate"
              value={settleRate(on.settled, on.unsettled)}
              hint={`${fmtInt(on.started)} started · ${fmtInt(on.unsettled)} failed, expired or abandoned`}
            />
            <KpiTile label="On-ramp pending" value={fmtInt(on.pending)} hint="open purchases right now, any age" />
          </>
        ) : null}
        {off ? (
          <>
            <KpiTile
              label="Off-ramp volume"
              value={fmtUsd(off.usdc)}
              current={off.usdc}
              previous={prev ? off.usdc_prev : undefined}
              hint={`${fmtInt(off.settled)} settled withdrawals`}
            />
            <KpiTile
              label="Off-ramp settle rate"
              value={settleRate(off.settled, off.unsettled)}
              hint={`${fmtInt(off.started)} started · ${fmtInt(off.unsettled)} failed, expired or abandoned`}
            />
            {/* The one number worth paging someone about: the row is opened before
                the USDC leaves the vault, so an unfinished pre-payout withdrawal
                can mean money moved with no payout behind it. */}
            <KpiTile
              label="Off-ramp stuck"
              value={fmtInt(off.stuck)}
              hint="over an hour old, unsettled, no payout created — check these by hand"
            />
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Settled ramps"
          hint={`Purchases and withdrawals that settled per ${range.bucket}`}
          rows={series}
          filename={`ramps-settled-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={series}
            series={[
              { key: 'onramp_settled', label: 'On-ramp' },
              { key: 'offramp_settled', label: 'Off-ramp' },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Started vs settled"
          hint={`Attempts opened vs. attempts that completed, per ${range.bucket}`}
          rows={series}
          filename={`ramps-funnel-${range.key}-${range.bucket}`}
        >
          <TimeSeriesLine
            rows={series}
            series={[
              { key: 'onramp_started', label: 'On-ramp started' },
              { key: 'onramp_settled', label: 'On-ramp settled' },
              { key: 'offramp_started', label: 'Off-ramp started' },
              { key: 'offramp_settled', label: 'Off-ramp settled' },
            ]}
          />
        </ChartCard>
        {tables.offramp ? (
          <ChartCard
            title="Off-ramp volume"
            hint={`Settled USDC leaving to local currency per ${range.bucket}`}
            rows={series}
            filename={`offramp-volume-${range.key}-${range.bucket}`}
          >
            <TimeSeriesBars rows={series} series={[{ key: 'offramp_usdc', label: 'Withdrawn', kind: 'usd' }]} />
          </ChartCard>
        ) : null}
        {tables.offramp ? (
          <ChartCard
            title="Unfinished off-ramps by step"
            hint="Where withdrawals older than an hour that never settled are parked (funds → create → payout)"
            rows={stuck}
            filename="offramp-stuck-by-step"
          >
            <CategoryBars rows={stuck} category="step" series={{ key: 'count', label: 'Withdrawals' }} />
          </ChartCard>
        ) : null}
        {tables.onramp ? (
          <DataTable
            title="On-ramp corridors"
            hint="Started in range, by country and currency. Fiat totals are per corridor — do not add them up."
            rows={onCorridors.map((r) => ({
              ...r,
              // Started-in-range is the denominator here, so a corridor with open
              // purchases reads below its eventual settle rate. That is the point:
              // it shows how much of the cohort has actually landed.
              rate: r.started ? fmtPct(r.settled / r.started) : '—',
              fiat: `${fmtInt(r.fiat)} ${r.currency}`,
            }))}
            columns={[
              { key: 'corridor', label: 'Corridor' },
              { key: 'started', label: 'Started', align: 'right' },
              { key: 'settled', label: 'Settled', align: 'right' },
              { key: 'rate', label: 'Settled so far', align: 'right' },
              { key: 'fiat', label: 'Fiat settled', align: 'right' },
            ]}
            filename="onramp-corridors"
          />
        ) : null}
        {tables.offramp ? (
          <DataTable
            title="Off-ramp corridors"
            hint="Started in range, by country, currency and rail"
            rows={offCorridorRows.map((r) => ({
              ...r,
              fiat: `${fmtInt(r.fiat)} ${r.currency}`,
              usdc: fmtUsd(r.usdc),
            }))}
            columns={[
              { key: 'corridor', label: 'Corridor' },
              { key: 'rail', label: 'Rail' },
              { key: 'started', label: 'Started', align: 'right' },
              { key: 'settled', label: 'Settled', align: 'right' },
              { key: 'usdc', label: 'USDC out', align: 'right' },
              { key: 'fiat', label: 'Fiat settled', align: 'right' },
            ]}
            filename="offramp-corridors"
          />
        ) : null}
      </div>
    </>
  );
}
