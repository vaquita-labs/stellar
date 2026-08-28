import { prisma } from '@vaquita/db';
import type { SqlWindow } from './common';

export type EngagementRow = {
  bucket: string;
  badges: number;
  follows: number;
  checkins: number;
  checkin_users: number;
  map_items: number;
  map_likes: number;
  push_subs: number;
};

/** Social / game activity per bucket, zero-filled. */
export async function engagementSeries(w: SqlWindow): Promise<EngagementRow[]> {
  return prisma.$queryRaw<EngagementRow[]>`
    with buckets as (
      select generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as b
    ),
    badges as (
      select date_trunc(${w.bucket}, confirmed_at) as b, count(*)::int as n from badge_claims
      where deleted_at is null and confirmed_at is not null and confirmed_at >= ${w.since} group by 1
    ),
    follows as (
      select date_trunc(${w.bucket}, created_at) as b, count(*)::int as n from follows where created_at >= ${w.since} group by 1
    ),
    checkins as (
      select date_trunc(${w.bucket}, created_at) as b, count(*)::int as n, count(distinct profile_id)::int as users
      from profiles_rewards where reason = 'daily-checkin' and created_at >= ${w.since} group by 1
    ),
    items as (
      select date_trunc(${w.bucket}, created_at) as b, count(*)::int as n from profiles_map_items where created_at >= ${w.since} group by 1
    ),
    likes as (
      select date_trunc(${w.bucket}, created_at) as b, count(*)::int as n from map_likes where created_at >= ${w.since} group by 1
    ),
    push as (
      select date_trunc(${w.bucket}, created_at) as b, count(*)::int as n from push_subscriptions where created_at >= ${w.since} group by 1
    )
    select to_char(buckets.b, 'YYYY-MM-DD') as bucket,
           coalesce(badges.n, 0) as badges,
           coalesce(follows.n, 0) as follows,
           coalesce(checkins.n, 0) as checkins,
           coalesce(checkins.users, 0) as checkin_users,
           coalesce(items.n, 0) as map_items,
           coalesce(likes.n, 0) as map_likes,
           coalesce(push.n, 0) as push_subs
    from buckets
    left join badges on badges.b = buckets.b
    left join follows on follows.b = buckets.b
    left join checkins on checkins.b = buckets.b
    left join items on items.b = buckets.b
    left join likes on likes.b = buckets.b
    left join push on push.b = buckets.b
    order by buckets.b
  `;
}

export type EngagementKpis = {
  badges: number;
  badges_prev: number;
  follows: number;
  follows_prev: number;
  checkin_users: number;
  checkin_users_prev: number;
  map_items: number;
  map_items_prev: number;
  push_subs_total: number;
  badges_total: number;
  legal_accepted: number;
};

export async function engagementKpis(w: SqlWindow): Promise<EngagementKpis> {
  const [row] = await prisma.$queryRaw<EngagementKpis[]>`
    select
      (select count(*) from badge_claims where deleted_at is null and confirmed_at >= ${w.since})::int as badges,
      (select count(*) from badge_claims where deleted_at is null and confirmed_at >= ${w.prevSince} and confirmed_at < ${w.since})::int as badges_prev,
      (select count(*) from follows where created_at >= ${w.since})::int as follows,
      (select count(*) from follows where created_at >= ${w.prevSince} and created_at < ${w.since})::int as follows_prev,
      (select count(distinct profile_id) from profiles_rewards where reason = 'daily-checkin' and created_at >= ${w.since})::int as checkin_users,
      (select count(distinct profile_id) from profiles_rewards where reason = 'daily-checkin' and created_at >= ${w.prevSince} and created_at < ${w.since})::int as checkin_users_prev,
      (select count(*) from profiles_map_items where created_at >= ${w.since})::int as map_items,
      (select count(*) from profiles_map_items where created_at >= ${w.prevSince} and created_at < ${w.since})::int as map_items_prev,
      (select count(*) from push_subscriptions)::int as push_subs_total,
      (select count(*) from badge_claims where deleted_at is null and confirmed_at is not null)::int as badges_total,
      (select count(distinct profile_id) from legal_acceptances)::int as legal_accepted
  `;
  return row!;
}

export type BadgeTypeRow = { badge_type: string; minted: number; wallets: number };

export async function badgesByType(w: SqlWindow): Promise<BadgeTypeRow[]> {
  return prisma.$queryRaw<BadgeTypeRow[]>`
    select badge_type, count(*)::int as minted, count(distinct wallet_address)::int as wallets
    from badge_claims
    where deleted_at is null and confirmed_at is not null and confirmed_at >= ${w.since}
    group by 1 order by minted desc
  `;
}

export type StatusRow = { label: string; count: number; amount: number };

/**
 * Fiat on-ramp purchases by status. The table is new (Bolivia BOB on-ramp) and
 * may not exist on every environment yet, so a missing relation renders as an
 * empty breakdown instead of a crashed page.
 */
export async function onrampByStatus(w: SqlWindow): Promise<StatusRow[] | null> {
  try {
    return await prisma.$queryRaw<StatusRow[]>`
      select status || ' · ' || currency as label,
             count(*)::int as count,
             coalesce(sum(case when amount_fiat ~ '^[0-9]+(\\.[0-9]+)?$' then amount_fiat::numeric else 0 end), 0)::float8 as amount
      from onramp_purchases
      where deleted_at is null and created_at >= ${w.since}
      group by status, currency
      order by count desc
    `;
  } catch {
    return null;
  }
}

export async function bridgeByStatus(w: SqlWindow): Promise<StatusRow[] | null> {
  try {
    return await prisma.$queryRaw<StatusRow[]>`
      select direction || ' · ' || status as label,
             count(*)::int as count,
             coalesce(sum(case when amount ~ '^[0-9]+(\\.[0-9]+)?$' then amount::numeric else 0 end), 0)::float8 as amount
      from bridge_transfers
      where deleted_at is null and created_at >= ${w.since}
      group by direction, status
      order by count desc
    `;
  } catch {
    return null;
  }
}
