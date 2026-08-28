import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { KpiTile } from '@/components/KpiTile';
import { RangePicker } from '@/components/RangePicker';
import { TimeSeriesBars, TimeSeriesLine } from '@/components/charts';
import { fmtInt, fmtUsd } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import {
  badgesByType,
  bridgeByStatus,
  engagementKpis,
  engagementSeries,
  onrampByStatus,
} from '@/lib/queries/engagement';
import { parseRange } from '@/lib/range';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EngagementPage({ searchParams }: Props) {
  const range = parseRange(await searchParams);
  const w = await sqlWindow(range);
  const [kpis, series, badges, onramp, bridge] = await Promise.all([
    engagementKpis(w),
    engagementSeries(w),
    badgesByType(w),
    onrampByStatus(w),
    bridgeByStatus(w),
  ]);
  const prev = w.hasPrev;
  const statusCols = [
    { key: 'label', label: 'Status' },
    { key: 'count', label: 'Count', align: 'right' as const },
    { key: 'amount', label: 'Amount', align: 'right' as const },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Engagement</h1>
          <p className="text-sm text-black/60">Game, social and fiat activity.</p>
        </div>
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Check-in users"
          value={fmtInt(kpis.checkin_users)}
          current={kpis.checkin_users}
          previous={prev ? kpis.checkin_users_prev : undefined}
          hint="distinct users with a daily check-in in range"
        />
        <KpiTile
          label="Badges minted"
          value={fmtInt(kpis.badges)}
          current={kpis.badges}
          previous={prev ? kpis.badges_prev : undefined}
          hint={`${fmtInt(kpis.badges_total)} all time`}
        />
        <KpiTile
          label="New follows"
          value={fmtInt(kpis.follows)}
          current={kpis.follows}
          previous={prev ? kpis.follows_prev : undefined}
          hint="follow edges created in range"
        />
        <KpiTile
          label="Map items"
          value={fmtInt(kpis.map_items)}
          current={kpis.map_items}
          previous={prev ? kpis.map_items_prev : undefined}
          hint="inventory rows created in range"
        />
        <KpiTile label="Push subscriptions" value={fmtInt(kpis.push_subs_total)} hint="devices registered, all time" />
        <KpiTile
          label="Legal accepted"
          value={fmtInt(kpis.legal_accepted)}
          hint="profiles that accepted the terms, all time"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Daily check-ins"
          hint={`Check-ins and distinct users per ${range.bucket}`}
          rows={series}
          filename={`checkins-${range.key}-${range.bucket}`}
        >
          <TimeSeriesLine
            rows={series}
            series={[
              { key: 'checkins', label: 'Check-ins' },
              { key: 'checkin_users', label: 'Users' },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Social"
          hint={`Follows and map likes per ${range.bucket}`}
          rows={series}
          filename={`social-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={series}
            series={[
              { key: 'follows', label: 'Follows' },
              { key: 'map_likes', label: 'Map likes' },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Badges minted"
          hint={`On-chain badge mints per ${range.bucket}`}
          rows={series}
          filename={`badges-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars rows={series} series={[{ key: 'badges', label: 'Badges' }]} />
        </ChartCard>
        <ChartCard
          title="Map items & push"
          hint={`Inventory items bought and push devices registered per ${range.bucket}`}
          rows={series}
          filename={`map-push-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={series}
            series={[
              { key: 'map_items', label: 'Map items' },
              { key: 'push_subs', label: 'Push subs' },
            ]}
          />
        </ChartCard>
        <DataTable
          title="Badges by type"
          hint="Mints in range"
          rows={badges}
          columns={[
            { key: 'badge_type', label: 'Badge' },
            { key: 'minted', label: 'Minted', align: 'right' },
            { key: 'wallets', label: 'Wallets', align: 'right' },
          ]}
          filename="badges-by-type"
        />
        <div className="flex flex-col gap-4">
          <DataTable
            title="Fiat on-ramp purchases"
            hint={
              onramp == null
                ? 'onramp_purchases table not present on this environment'
                : 'Created in range, by status and currency (amount in fiat)'
            }
            rows={(onramp ?? []).map((r) => ({ ...r, amount: fmtInt(r.amount) }))}
            columns={statusCols}
            filename="onramp-purchases"
          />
          <DataTable
            title="CCTP bridge transfers"
            hint={
              bridge == null
                ? 'bridge_transfers table not present on this environment'
                : 'Created in range, by direction and status (USDC)'
            }
            rows={(bridge ?? []).map((r) => ({ ...r, amount: fmtUsd(r.amount) }))}
            columns={statusCols}
            filename="bridge-transfers"
          />
        </div>
      </div>
    </>
  );
}
