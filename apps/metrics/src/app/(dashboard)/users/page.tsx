import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { KpiTile } from '@/components/KpiTile';
import { RangePicker } from '@/components/RangePicker';
import { CategoryBars, TimeSeriesBars, TimeSeriesLine } from '@/components/charts';
import { fmtInt, fmtPct } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import { signupFunnel, signupSeries, topReferrers, userKpis } from '@/lib/queries/users';
import { parseRange } from '@/lib/range';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function UsersPage({ searchParams }: Props) {
  const range = parseRange(await searchParams);
  const w = await sqlWindow(range);
  const [kpis, series, funnel, referrers] = await Promise.all([
    userKpis(w),
    signupSeries(w),
    signupFunnel(w),
    topReferrers(w),
  ]);
  const prev = w.hasPrev;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Users</h1>
          <p className="text-sm text-black/60">Acquisition, activation and referrals.</p>
        </div>
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Total users" value={fmtInt(kpis.total_users)} hint="profiles, all time" />
        <KpiTile
          label="New users"
          value={fmtInt(kpis.new_users)}
          current={kpis.new_users}
          previous={prev ? kpis.new_users_prev : undefined}
          hint="created in range"
        />
        <KpiTile
          label="Active depositors"
          value={fmtInt(kpis.active_depositors)}
          current={kpis.active_depositors}
          previous={prev ? kpis.active_depositors_prev : undefined}
          hint="wallets with a confirmed deposit in range"
        />
        <KpiTile
          label="Activated ≤7d"
          value={kpis.activation_cohort ? fmtPct(kpis.activated_7d / kpis.activation_cohort) : '—'}
          hint={`${fmtInt(kpis.activated_7d)} of ${fmtInt(kpis.activation_cohort)} new users deposited within 7 days`}
        />
        <KpiTile
          label="Onboarding done"
          value={kpis.total_users ? fmtPct(kpis.onboarded / kpis.total_users) : '—'}
          hint={`${fmtInt(kpis.onboarded)} profiles · tutorial ${fmtInt(kpis.tutorial_done)}`}
        />
        <KpiTile
          label="Referred"
          value={kpis.total_users ? fmtPct(kpis.referred / kpis.total_users) : '—'}
          hint={`${fmtInt(kpis.referred)} users came via a referral code`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="New users"
          hint={`Profiles created per ${range.bucket}, split by referral`}
          rows={series}
          filename={`new-users-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={series.map((r) => ({ ...r, organic: r.signups - r.referred }))}
            series={[
              { key: 'organic', label: 'Organic' },
              { key: 'referred', label: 'Referred' },
            ]}
            stacked
          />
        </ChartCard>
        <ChartCard
          title="Total users"
          hint="Running total of profiles"
          rows={series}
          filename={`total-users-${range.key}-${range.bucket}`}
        >
          <TimeSeriesLine rows={series} series={[{ key: 'total', label: 'Users' }]} />
        </ChartCard>
        <ChartCard
          title="Signup → deposit funnel"
          hint="Profiles created in range, by the furthest step they reached"
          rows={funnel}
          filename={`signup-funnel-${range.key}`}
        >
          <CategoryBars rows={funnel} category="step" series={{ key: 'users', label: 'Users' }} />
        </ChartCard>
        <DataTable
          title="Top referrers"
          hint="All-time referrals per profile; “in range” = referred users created in the selected range"
          rows={referrers.map((r) => ({
            ...r,
            nickname: r.nickname ?? '—',
            wallet: `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}`,
          }))}
          columns={[
            { key: 'nickname', label: 'Nickname' },
            { key: 'wallet', label: 'Wallet' },
            { key: 'referrals', label: 'Referrals', align: 'right' },
            { key: 'in_range', label: 'In range', align: 'right' },
            { key: 'activated', label: 'Activated', align: 'right' },
          ]}
          filename="top-referrers"
        />
      </div>
    </>
  );
}
