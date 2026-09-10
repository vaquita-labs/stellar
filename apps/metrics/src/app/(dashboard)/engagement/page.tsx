import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { KpiTile } from '@/components/KpiTile';
import { RangePicker } from '@/components/RangePicker';
import { TimeSeriesBars, TimeSeriesLine } from '@/components/charts';
import { fmtInt, fmtPct, fmtUsd } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import {
  badgesByType,
  bridgeByStatus,
  engagementKpis,
  engagementSeries,
  onrampByStatus,
} from '@/lib/queries/engagement';
import { Pager } from '@/components/Pager';
import { hasPwaInstalls, pwaKpis, pwaSeries, pwaUsersPage } from '@/lib/queries/pwa';
import { sampleAge } from '@/lib/queries/vault';
import { parsePage } from '@/lib/range';
import { resolveRange } from '@/lib/rangePrefs';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EngagementPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = await resolveRange(params);
  const page = parsePage(params);
  const w = await sqlWindow(range);
  const [kpis, series, badges, onramp, bridge, pwaPresent] = await Promise.all([
    engagementKpis(w),
    engagementSeries(w),
    badgesByType(w),
    onrampByStatus(w),
    bridgeByStatus(w),
    hasPwaInstalls(),
  ]);
  // Gated behind the probe: an environment without the migration must still
  // render this page, not 500 on a relation Postgres cannot parse.
  const [pwa, pwaCurve, pwaUsers] = pwaPresent
    ? await Promise.all([pwaKpis(w), pwaSeries(w), pwaUsersPage({ limit: page.limit, offset: page.offset })])
    : [null, [], null];
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

      {/* Installed app. Its own section rather than two more tiles in the grid
          above, because the question it answers is a different one: how many
          people can we reach with a push notification at all. On iOS nothing
          gets through until the app is on the home screen, so this number is
          the ceiling on every push campaign. */}
      <div>
        <h2 className="text-lg font-semibold text-black">Installed app (PWA)</h2>
        <p className="text-sm text-black/60">
          {pwa
            ? 'Reported by the app itself on each launch: there is no install API to ask. Nothing reports an uninstall, so a stale "Last launch" is the only evidence one happened.'
            : 'pwa_installs table not present on this environment.'}
        </p>
      </div>

      {pwa && pwaUsers ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiTile
              label="Installed users"
              value={fmtInt(pwa.users)}
              hint={`${fmtPct(pwa.profiles ? pwa.users / pwa.profiles : 0)} of ${fmtInt(pwa.profiles)} profiles`}
            />
            <KpiTile
              label="New installs"
              value={fmtInt(pwa.new_installs)}
              current={pwa.new_installs}
              previous={prev ? pwa.new_installs_prev : undefined}
              hint="first seen in range"
            />
            <KpiTile label="iOS" value={fmtInt(pwa.ios)} hint="where push needs the install" />
            <KpiTile label="Android" value={fmtInt(pwa.android)} hint={`${fmtInt(pwa.desktop)} desktop`} />
            <KpiTile
              label="Launched in 7d"
              value={fmtInt(pwa.active_7d)}
              hint={`of ${fmtInt(pwa.users)} installed users`}
            />
            <KpiTile
              label="Installed & push-ready"
              value={fmtInt(pwa.with_push)}
              hint="installed users with a push device registered"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="New installs"
              hint={`First launch of the installed app per ${range.bucket}`}
              rows={pwaCurve}
              filename={`pwa-installs-${range.key}-${range.bucket}`}
            >
              <TimeSeriesBars
                rows={pwaCurve}
                series={[
                  { key: 'installs', label: 'Installs' },
                  { key: 'users', label: 'Users' },
                ]}
              />
            </ChartCard>
            <DataTable
              title="Installed users"
              hint="One line per user, newest install first. A user on two platforms shows both."
              rows={pwaUsers.rows.map((r) => ({
                nickname: r.nickname ?? '—',
                wallet: `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}`,
                platforms: r.platforms,
                push: r.push ? 'yes' : 'no',
                installed_at: r.installed_at.toISOString().slice(0, 10),
                last_seen_at: sampleAge(r.last_seen_at),
              }))}
              columns={[
                { key: 'nickname', label: 'Nickname' },
                { key: 'wallet', label: 'Wallet' },
                { key: 'platforms', label: 'Platforms' },
                { key: 'push', label: 'Push' },
                { key: 'installed_at', label: 'Installed' },
                { key: 'last_seen_at', label: 'Last launch', align: 'right' },
              ]}
              filename={`pwa-users-p${page.page}`}
              footer={
                <Pager
                  page={page.page}
                  limit={page.limit}
                  total={pwaUsers.total}
                  params={{ range: range.key, bucket: range.bucket, limit: String(page.limit) }}
                />
              }
            />
          </div>
        </>
      ) : null}
    </>
  );
}
