import { prisma } from '@vaquita/db';
import type { SqlWindow } from './common';
import { hasVaultFlows, vaultDepositEvents } from './vault';

/**
 * Campaign attribution metrics: which campaign brought users who actually
 * deposited.
 *
 * `campaigns` and `profiles.campaign_id` are new and are applied by hand per
 * environment, so they may not exist here yet. A missing relation fails the
 * whole statement at PARSE time — not at row-read time — so every query below
 * is gated on `hasCampaigns()` by the page, which renders an empty state
 * instead. Same reasoning as `hasOnrampPurchases()` in src/lib/report.ts.
 */

/** Is the campaigns schema present in this environment? */
export async function hasCampaigns(): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ present: boolean }[]>`
    select (to_regclass('public.campaigns') is not null
            and exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'profiles'
                            and column_name = 'campaign_id')) as present
  `;
  return row?.present ?? false;
}

export type CampaignKpis = {
  campaigns_active: number;
  attributed: number;
  attributed_prev: number;
  attributed_total: number;
  new_users: number;
  activated: number;
  volume: number;
};

export async function campaignKpis(w: SqlWindow): Promise<CampaignKpis> {
  const flows = vaultDepositEvents(await hasVaultFlows());
  const [row] = await prisma.$queryRaw<CampaignKpis[]>`
    with saved as (
      select wallet_address, amount::float8 as amount from deposits
      where deleted_at is null and status = 'confirmed'
      union all
      select wallet_address, amount from ${flows} f
    )
    select
      (select count(*) from campaigns where deleted_at is null and is_active)::int as campaigns_active,
      (select count(*) from profiles where deleted_at is null and campaign_id is not null
         and created_at >= ${w.since})::int as attributed,
      (select count(*) from profiles where deleted_at is null and campaign_id is not null
         and created_at >= ${w.prevSince} and created_at < ${w.since})::int as attributed_prev,
      (select count(*) from profiles where deleted_at is null and campaign_id is not null)::int as attributed_total,
      (select count(*) from profiles where deleted_at is null and created_at >= ${w.since})::int as new_users,
      -- Activated = signed up in range through a campaign AND saved, in either
      -- product. Not time-boxed to the range: the deposit is the conversion, and
      -- it counts whenever it lands. Counting only locked deposits punished the
      -- campaigns that acquire the users least likely to lock money up.
      (select count(*) from profiles p where p.deleted_at is null and p.campaign_id is not null
         and p.created_at >= ${w.since}
         and exists (select 1 from saved s where s.wallet_address = p.wallet_address))::int as activated,
      (select coalesce(sum(s.amount), 0) from saved s
         join profiles p on p.wallet_address = s.wallet_address
        where p.deleted_at is null and p.campaign_id is not null
          and p.created_at >= ${w.since})::float8 as volume
  `;
  return row!;
}

export type CampaignSeriesRow = { bucket: string; attributed: number; organic: number };

/** Attributed vs organic signups per bucket, zero-filled across the window. */
export async function campaignSeries(w: SqlWindow): Promise<CampaignSeriesRow[]> {
  return prisma.$queryRaw<CampaignSeriesRow[]>`
    with buckets as (
      select generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as b
    ),
    s as (
      select date_trunc(${w.bucket}, created_at) as b,
             count(*) filter (where campaign_id is not null)::int as attributed,
             count(*) filter (where campaign_id is null)::int as organic
      from profiles
      where deleted_at is null and created_at >= ${w.since}
      group by 1
    )
    select to_char(buckets.b, 'YYYY-MM-DD') as bucket,
           coalesce(s.attributed, 0) as attributed,
           coalesce(s.organic, 0) as organic
    from buckets left join s on s.b = buckets.b
    order by buckets.b
  `;
}

export type CampaignTableRow = {
  code: string;
  name: string;
  signups: number;
  in_range: number;
  onboarded: number;
  depositors: number;
  volume: number;
};

/**
 * The conversion funnel per campaign: signups → onboarded → first deposit →
 * volume. All-time totals with an "in range" column beside them, matching how
 * `topReferrers` presents the same idea — a campaign's worth is cumulative, but
 * you still want to see what it did lately.
 */
export async function campaignTable(w: SqlWindow): Promise<CampaignTableRow[]> {
  const flows = vaultDepositEvents(await hasVaultFlows());
  return prisma.$queryRaw<CampaignTableRow[]>`
    with saved as (
      select wallet_address, amount::float8 as amount from deposits
      where deleted_at is null and status = 'confirmed'
      union all
      select wallet_address, amount from ${flows} f
    )
    select c.code,
           c.name,
           count(p.id)::int as signups,
           count(p.id) filter (where p.created_at >= ${w.since})::int as in_range,
           count(p.id) filter (where p.onboarding_completed)::int as onboarded,
           count(p.id) filter (where exists (select 1 from saved s where s.wallet_address = p.wallet_address))::int as depositors,
           coalesce((select sum(s.amount) from saved s
                      where s.wallet_address in (select p2.wallet_address from profiles p2
                                                  where p2.campaign_id = c.id and p2.deleted_at is null)), 0)::float8 as volume
    from campaigns c
    left join profiles p on p.campaign_id = c.id and p.deleted_at is null
    where c.deleted_at is null
    group by c.id, c.code, c.name
    order by signups desc, c.id desc
    limit 50
  `;
}
