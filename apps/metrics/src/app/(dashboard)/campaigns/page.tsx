import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { KpiTile } from '@/components/KpiTile';
import { RangePicker } from '@/components/RangePicker';
import { TimeSeriesBars } from '@/components/charts';
import { fmtInt, fmtPct, fmtUsd } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import { campaignKpis, campaignSeries, campaignTable, hasCampaigns } from '@/lib/queries/campaigns';
import { parseRange } from '@/lib/range';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CampaignsPage({ searchParams }: Props) {
  const range = parseRange(await searchParams);

  // The campaigns migration is applied by hand per environment, and a missing
  // relation fails the statement at parse time — so probe before querying.
  if (!(await hasCampaigns())) {
    return (
      <>
        <div>
          <h1 className="text-xl font-semibold text-black">Campaigns</h1>
          <p className="text-sm text-black/60">Which campaign brought users who actually deposited.</p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-black/70">
          The campaigns schema is not present in this environment yet. Apply
          <code className="mx-1 rounded bg-black/5 px-1 font-mono text-xs">
            apps/supabase/migrations/20260905_campaigns.sql
          </code>
          and reload.
        </div>
      </>
    );
  }

  const w = await sqlWindow(range);
  const [kpis, series, table] = await Promise.all([campaignKpis(w), campaignSeries(w), campaignTable(w)]);
  const prev = w.hasPrev;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Campaigns</h1>
          <p className="text-sm text-black/60">Which campaign brought users who actually deposited.</p>
        </div>
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiTile label="Active campaigns" value={fmtInt(kpis.campaigns_active)} hint="not retired, accepting new visitors" />
        <KpiTile
          label="Attributed signups"
          value={fmtInt(kpis.attributed)}
          current={kpis.attributed}
          previous={prev ? kpis.attributed_prev : undefined}
          hint={`${fmtInt(kpis.attributed_total)} all time`}
        />
        <KpiTile
          label="Share of signups"
          value={kpis.new_users ? fmtPct(kpis.attributed / kpis.new_users) : '—'}
          hint={`${fmtInt(kpis.attributed)} of ${fmtInt(kpis.new_users)} new users in range`}
        />
        <KpiTile
          label="Activated"
          value={kpis.attributed ? fmtPct(kpis.activated / kpis.attributed) : '—'}
          hint={`${fmtInt(kpis.activated)} attributed users made a confirmed deposit`}
        />
        <KpiTile label="Deposit volume" value={fmtUsd(kpis.volume)} hint="confirmed deposits by attributed users" />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <ChartCard
          title="Signups by attribution"
          hint={`Profiles created per ${range.bucket}, attributed to a campaign vs organic`}
          rows={series}
          filename={`campaign-signups-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={series}
            series={[
              { key: 'organic', label: 'Organic' },
              { key: 'attributed', label: 'Campaign' },
            ]}
            stacked
          />
        </ChartCard>
        <DataTable
          title="Campaign funnel"
          hint="All-time totals per campaign; “in range” = attributed signups created in the selected range"
          rows={table.map((r) => ({ ...r, volume: fmtUsd(r.volume) }))}
          columns={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Campaign' },
            { key: 'signups', label: 'Signups', align: 'right' },
            { key: 'in_range', label: 'In range', align: 'right' },
            { key: 'onboarded', label: 'Onboarded', align: 'right' },
            { key: 'depositors', label: 'Depositors', align: 'right' },
            { key: 'volume', label: 'Volume', align: 'right' },
          ]}
          filename="campaign-funnel"
        />
      </div>
    </>
  );
}
