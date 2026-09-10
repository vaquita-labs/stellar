import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { KpiTile } from '@/components/KpiTile';
import { Pager } from '@/components/Pager';
import { RangePicker } from '@/components/RangePicker';
import { CategoryBars, TimeSeriesBars } from '@/components/charts';
import { fmtInt, fmtPct } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import {
  hasReferralAttribution,
  recentReferredSignups,
  referralChannels,
  referralKpis,
  referralSeries,
  referrersPage,
} from '@/lib/queries/referrals';
import { parsePage } from '@/lib/range';
import { resolveRange } from '@/lib/rangePrefs';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const shortWallet = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

export default async function ReferralsPage({ searchParams }: Props) {
  const params = await searchParams;
  const range = await resolveRange(params);
  const page = parsePage(params);

  // `profiles.attribution` arrives with the campaigns migration, applied by hand
  // per environment. A missing column fails the statement at parse time, so
  // probe before querying rather than blanking the page.
  if (!(await hasReferralAttribution())) {
    return (
      <>
        <div>
          <h1 className="text-xl font-semibold text-black">Referrals</h1>
          <p className="text-sm text-black/60">Who is bringing users in, and through which channel.</p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-black/70">
          The attribution column is not present in this environment yet. Apply
          <code className="mx-1 rounded bg-black/5 px-1 font-mono text-xs">
            apps/supabase/migrations/20260905_campaigns.sql
          </code>
          and reload.
        </div>
      </>
    );
  }

  const w = await sqlWindow(range);
  const [kpis, series, channels, referrers, recent] = await Promise.all([
    referralKpis(w),
    referralSeries(w),
    referralChannels(w),
    referrersPage({ w, limit: page.limit, offset: page.offset }),
    recentReferredSignups(w),
  ]);
  const prev = w.hasPrev;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Referrals</h1>
          <p className="text-sm text-black/60">Who is bringing users in, and through which channel.</p>
        </div>
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Referred signups"
          value={fmtInt(kpis.referred)}
          current={kpis.referred}
          previous={prev ? kpis.referred_prev : undefined}
          hint={`${fmtInt(kpis.referred_total)} all time`}
        />
        <KpiTile
          label="Share of signups"
          value={fmtPct(kpis.profiles_total ? kpis.referred_total / kpis.profiles_total : 0)}
          hint="referred profiles over all profiles, all time"
        />
        <KpiTile
          label="Active referrers"
          value={fmtInt(kpis.referrers)}
          hint="profiles who brought at least one user"
        />
        <KpiTile
          label="Referred & saving"
          value={fmtInt(kpis.saving)}
          hint="locked or flexible, whenever the deposit landed"
        />
        <KpiTile
          label="Referred conversion"
          value={fmtPct(kpis.referred_total ? kpis.saving / kpis.referred_total : 0)}
          hint="of referred profiles that ever saved"
        />
        {/* The backfill check. Codes mint on the profile read path, so anything
            short of parity means profiles exist that have never been read. */}
        <KpiTile
          label="Profiles with a code"
          value={fmtInt(kpis.with_code)}
          hint={`of ${fmtInt(kpis.profiles_total)} — every profile should have one`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Referred signups"
          hint={`Profiles that arrived through someone's link per ${range.bucket}`}
          rows={series}
          filename={`referred-signups-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={series}
            series={[
              { key: 'referred', label: 'Referred' },
              { key: 'other', label: 'Everyone else' },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Channel"
          hint="Where the shared link was opened, read from the stored UTMs. 'direct' means the link carried no stamp."
          rows={channels}
          filename={`referral-channels-${range.key}`}
        >
          <CategoryBars rows={channels} category="channel" series={{ key: 'signups', label: 'Signups' }} />
        </ChartCard>
      </div>

      <DataTable
        title="Channel breakdown"
        hint="Source and medium as they arrived on the link. 'referral' as the medium is what a share button stamps."
        rows={channels.map((r) => ({
          channel: r.channel,
          medium: r.medium,
          signups: r.signups,
          saving: r.saving,
          conversion: fmtPct(r.signups ? r.saving / r.signups : 0),
        }))}
        columns={[
          { key: 'channel', label: 'Source' },
          { key: 'medium', label: 'Medium' },
          { key: 'signups', label: 'Signups', align: 'right' },
          { key: 'saving', label: 'Saving', align: 'right' },
          { key: 'conversion', label: 'Conversion', align: 'right' },
        ]}
        filename={`referral-channels-table-${range.key}`}
      />

      <DataTable
        title="Referrers"
        hint="Lifetime totals with the current range beside them. Sorted by who brought the most."
        rows={referrers.rows.map((r) => ({
          nickname: r.nickname ?? '—',
          wallet: shortWallet(r.wallet),
          code: r.code ?? '—',
          referrals: r.referrals,
          in_range: r.in_range,
          saving: r.saving,
          top_channel: r.top_channel,
          last_referral: r.last_referral.toISOString().slice(0, 10),
        }))}
        columns={[
          { key: 'nickname', label: 'Nickname' },
          { key: 'wallet', label: 'Wallet' },
          { key: 'code', label: 'Code' },
          { key: 'referrals', label: 'Referred', align: 'right' },
          { key: 'in_range', label: 'In range', align: 'right' },
          { key: 'saving', label: 'Saving', align: 'right' },
          { key: 'top_channel', label: 'Top channel' },
          { key: 'last_referral', label: 'Last', align: 'right' },
        ]}
        filename={`referrers-p${page.page}`}
        footer={
          <Pager
            page={page.page}
            limit={page.limit}
            total={referrers.total}
            params={{ range: range.key, bucket: range.bucket, limit: String(page.limit) }}
          />
        }
      />

      <DataTable
        title="Recent referred signups"
        hint="The raw blob, one row per signup in range. An empty source means the link carried no stamp."
        rows={recent.map((r) => ({
          joined: r.joined ?? shortWallet(r.joined_wallet),
          referrer: r.referrer ?? shortWallet(r.referrer_wallet),
          utm_source: r.utm_source ?? '—',
          utm_medium: r.utm_medium ?? '—',
          utm_campaign: r.utm_campaign ?? '—',
          utm_content: r.utm_content ?? '—',
          landing_referrer: r.landing_referrer ?? '—',
          created_at: r.created_at.toISOString().slice(0, 10),
        }))}
        columns={[
          { key: 'joined', label: 'Joined' },
          { key: 'referrer', label: 'Invited by' },
          { key: 'utm_source', label: 'Source' },
          { key: 'utm_medium', label: 'Medium' },
          { key: 'utm_campaign', label: 'Campaign' },
          { key: 'utm_content', label: 'Content' },
          { key: 'landing_referrer', label: 'Landed from' },
          { key: 'created_at', label: 'Date', align: 'right' },
        ]}
        filename={`referred-signups-${range.key}`}
      />
    </>
  );
}
