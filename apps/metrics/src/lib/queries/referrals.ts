import { prisma } from '@vaquita/db';
import type { SqlWindow } from './common';
import { hasVaultFlows, vaultDepositEvents } from './vault';
import { heldBalances, volumeEvents, volumeTables } from './volume';

/**
 * Invite-a-friend metrics: who is bringing users in, how many of them save, and
 * through which channel.
 *
 * The channel is the part nothing else in the dashboard reads.
 * `profiles.attribution` is a jsonb blob written once at first touch by
 * `POST /attribution` — the raw `utm_*` values exactly as they arrived — and
 * until now it was write-only. A referral link stamps `utm_medium=referral` and
 * `utm_source=<channel>` before it leaves the app, so grouping on those two keys
 * is what turns "someone shared this" into "someone shared this on WhatsApp".
 *
 * Campaigns and referrals are complementary, never alternatives: a campaign
 * writes `campaign_id`, a referral writes `referred_by_id`, and `?ref=` resolves
 * campaign first. Every query here filters on `referred_by_id is not null`, so
 * campaign traffic is not double-counted in these panels.
 *
 * `attribution` arrives with the campaigns migration, applied by hand per
 * environment. A missing column fails the whole statement at PARSE time, not at
 * row-read time, so the page gates on `hasReferralAttribution()` and renders an
 * empty state instead of blanking.
 */

/** Is the attribution column present in this environment? */
export async function hasReferralAttribution(): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ present: boolean }[]>`
    select exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'profiles'
                       and column_name = 'attribution') as present
  `;
  return row?.present ?? false;
}

export type ReferralKpis = {
  with_code: number;
  profiles_total: number;
  referred: number;
  referred_prev: number;
  referred_total: number;
  referrers: number;
  saving: number;
};

/**
 * Headline numbers. `with_code` against `profiles_total` is the one to watch
 * after the backfill: codes are minted on the profile read path, so anything
 * short of parity means profiles exist that have never been read.
 */
export async function referralKpis(w: SqlWindow): Promise<ReferralKpis> {
  const flows = vaultDepositEvents(await hasVaultFlows());
  const [row] = await prisma.$queryRaw<ReferralKpis[]>`
    with saved as (
      select wallet_address from deposits
      where deleted_at is null and status = 'confirmed'
      union
      select wallet_address from ${flows} f
    )
    select
      (select count(*) from profiles where deleted_at is null and referral_code is not null)::int as with_code,
      (select count(*) from profiles where deleted_at is null)::int as profiles_total,
      (select count(*) from profiles where deleted_at is null and referred_by_id is not null
         and created_at >= ${w.since})::int as referred,
      (select count(*) from profiles where deleted_at is null and referred_by_id is not null
         and created_at >= ${w.prevSince} and created_at < ${w.since})::int as referred_prev,
      (select count(*) from profiles where deleted_at is null and referred_by_id is not null)::int as referred_total,
      (select count(distinct referred_by_id) from profiles
        where deleted_at is null and referred_by_id is not null)::int as referrers,
      -- Not time-boxed to the range, like the campaign funnel: the deposit is
      -- the conversion and it counts whenever it lands.
      (select count(*) from profiles p where p.deleted_at is null and p.referred_by_id is not null
         and exists (select 1 from saved s where s.wallet_address = p.wallet_address))::int as saving
  `;
  return row!;
}

export type ReferralSeriesRow = { bucket: string; referred: number; other: number };

/** Referred vs everyone else, per bucket, zero-filled across the window. */
export async function referralSeries(w: SqlWindow): Promise<ReferralSeriesRow[]> {
  return prisma.$queryRaw<ReferralSeriesRow[]>`
    with buckets as (
      select generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as b
    ),
    s as (
      select date_trunc(${w.bucket}, created_at) as b,
             count(*) filter (where referred_by_id is not null)::int as referred,
             count(*) filter (where referred_by_id is null)::int as other
      from profiles
      where deleted_at is null and created_at >= ${w.since}
      group by 1
    )
    select to_char(buckets.b, 'YYYY-MM-DD') as bucket,
           coalesce(s.referred, 0)::int as referred,
           coalesce(s.other, 0)::int as other
    from buckets left join s on s.b = buckets.b
    order by buckets.b
  `;
}

export type ReferralChannelRow = {
  channel: string;
  medium: string;
  signups: number;
  saving: number;
};

/**
 * Where the shared links are being opened, straight from the stored blob.
 *
 * A referred signup with no `utm_source` buckets as `direct`: either the link
 * was shared before the stamps existed, or the user retyped the code by hand.
 * It is a real category, not a gap to hide.
 */
export async function referralChannels(w: SqlWindow): Promise<ReferralChannelRow[]> {
  const flows = vaultDepositEvents(await hasVaultFlows());
  return prisma.$queryRaw<ReferralChannelRow[]>`
    with saved as (
      select wallet_address from deposits
      where deleted_at is null and status = 'confirmed'
      union
      select wallet_address from ${flows} f
    )
    select coalesce(nullif(p.attribution->>'utmSource', ''), 'direct') as channel,
           coalesce(nullif(p.attribution->>'utmMedium', ''), 'direct') as medium,
           count(*)::int as signups,
           count(*) filter (where exists (select 1 from saved s where s.wallet_address = p.wallet_address))::int as saving
    from profiles p
    where p.deleted_at is null and p.referred_by_id is not null
      and p.created_at >= ${w.since}
    group by 1, 2
    order by signups desc, channel
    limit 30
  `;
}

export type ReferrerRow = {
  nickname: string | null;
  wallet: string;
  code: string | null;
  referrals: number;
  in_range: number;
  saving: number;
  /** Vault plus locked principal held by this referrer's referees, right now. */
  held: number;
  /** Gross volume those referees have moved, lifetime. */
  volume: number;
  top_channel: string;
  last_referral: Date;
};

/**
 * One row per referrer, newest activity in the "in range" column beside the
 * lifetime total — the same shape `topReferrers` uses on the Users page, which
 * stays there as a 15-row summary. This is the paginated full list.
 *
 * `held` and `volume` answer the question a headcount cannot: a referrer who
 * brought thirty people who deposited nothing looks identical to one who brought
 * three who funded the vault. Both are lifetime, matching this table's existing
 * framing — a balance is a balance, and "moved so far" is the ask.
 *
 * Both money CTEs aggregate **once across every wallet** and are then joined per
 * referee. Doing it per referrer inside a correlated subquery would rescan the
 * whole event union for each row on the page. Each CTE is one row per wallet, so
 * the joins cannot multiply rows and the counts beside them stay exact.
 */
export async function referrersPage(args: {
  w: SqlWindow;
  limit: number;
  offset: number;
}): Promise<{ rows: ReferrerRow[]; total: number; heldAt: Date | null }> {
  const { w, limit, offset } = args;
  const flows = vaultDepositEvents(await hasVaultFlows());
  const volumeSources = await volumeTables();

  const rows = await prisma.$queryRaw<(ReferrerRow & { total: bigint; held_at: Date | null })[]>`
    with saved as (
      select wallet_address from deposits
      where deleted_at is null and status = 'confirmed'
      union
      select wallet_address from ${flows} f
    ),
    held as (
      select h.wallet_address, (h.vault + h.locked)::float8 as held, h.scraped_at
      from ${heldBalances()} h
    ),
    moved as (
      select ev.wallet_address, sum(ev.amount)::float8 as volume
      from ${volumeEvents(volumeSources)} ev
      where ev.wallet_address is not null
      group by 1
    ),
    agg as (
      select r.id,
             r.nickname,
             r.wallet_address as wallet,
             r.referral_code as code,
             count(*)::int as referrals,
             count(*) filter (where p.created_at >= ${w.since})::int as in_range,
             count(*) filter (where exists (select 1 from saved s where s.wallet_address = p.wallet_address))::int as saving,
             coalesce(sum(h.held), 0)::float8 as held,
             coalesce(sum(m.volume), 0)::float8 as volume,
             max(h.scraped_at) as held_at,
             -- mode() picks the channel this referrer's signups came through
             -- most often. Ties break arbitrarily, which is fine for a column
             -- that only says "mostly WhatsApp".
             coalesce(mode() within group (order by nullif(p.attribution->>'utmSource', '')), 'direct') as top_channel,
             max(p.created_at) as last_referral
      from profiles p
      join profiles r on r.id = p.referred_by_id
      left join held h on h.wallet_address = p.wallet_address
      left join moved m on m.wallet_address = p.wallet_address
      where p.deleted_at is null
      group by r.id, r.nickname, r.wallet_address, r.referral_code
    )
    select agg.*, count(*) over ()::bigint as total
    from agg
    order by referrals desc, saving desc, last_referral desc
    limit ${limit} offset ${offset}
  `;

  // The balance snapshot's age, for the column hint: these are scraped numbers,
  // not live reads, and every other balance readout in this dashboard says so.
  const heldAt = rows.reduce<Date | null>(
    (newest, r) => (r.held_at && (!newest || r.held_at > newest) ? r.held_at : newest),
    null
  );
  return { rows, total: Number(rows[0]?.total ?? 0), heldAt };
}

export type ReferredSignupRow = {
  referrer: string | null;
  referrer_wallet: string;
  joined: string | null;
  joined_wallet: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  landing_referrer: string | null;
  created_at: Date;
};

/**
 * The raw feed: every referred signup in range with its UTM blob spread out.
 *
 * The fastest way to tell whether a stamp is actually landing — if the share
 * buttons are working, `utm_source` here is never empty for a new row.
 */
export async function recentReferredSignups(w: SqlWindow, limit = 25): Promise<ReferredSignupRow[]> {
  return prisma.$queryRaw<ReferredSignupRow[]>`
    select r.nickname as referrer,
           r.wallet_address as referrer_wallet,
           p.nickname as joined,
           p.wallet_address as joined_wallet,
           p.attribution->>'utmSource' as utm_source,
           p.attribution->>'utmMedium' as utm_medium,
           p.attribution->>'utmCampaign' as utm_campaign,
           p.attribution->>'utmContent' as utm_content,
           p.attribution->>'referrer' as landing_referrer,
           p.created_at
    from profiles p
    join profiles r on r.id = p.referred_by_id
    where p.deleted_at is null and p.created_at >= ${w.since}
    order by p.created_at desc
    limit ${limit}
  `;
}
