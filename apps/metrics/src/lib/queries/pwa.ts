import { prisma } from '@vaquita/db';
import type { SqlWindow } from './common';

/**
 * `pwa_installs` does not exist on environments where the migration has not
 * been applied by hand, and a missing relation fails the whole statement at
 * parse time — the same trap `hasVaultFlows` exists for. Probe first.
 */
export async function hasPwaInstalls(): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ present: boolean }[]>`
    select to_regclass('public.pwa_installs') is not null as present
  `;
  return row?.present ?? false;
}

export type PwaKpis = {
  /** Distinct profiles with the app on at least one device. */
  users: number;
  /** Rows: one per profile per platform, so a user with two platforms counts twice. */
  installs: number;
  android: number;
  ios: number;
  desktop: number;
  /** First seen inside the window. */
  new_installs: number;
  /** Same length of window immediately before it, for the delta arrow. */
  new_installs_prev: number;
  /** Seen launching the installed app within the last 7 days. */
  active_7d: number;
  /** Installed users who also registered a push device. This is the point. */
  with_push: number;
  /** Profiles alive at all, so the install share means something. */
  profiles: number;
};

/**
 * Headline install figures.
 *
 * `users` and `installs` differ on purpose: the table is keyed on
 * (profile, platform), so one person with an iPhone and an Android laptop is
 * one user and two installs. Reach is a question about people, so the tiles
 * lead with `users`.
 *
 * `active_7d` is the only signal an uninstall ever produces. Nothing tells us
 * an app was deleted — it simply stops launching — so a row whose `last_seen_at`
 * has gone stale is the closest thing to evidence there will be. It is a lagging
 * hint, not a count of uninstalls, and it must not be labelled as one.
 */
export async function pwaKpis(w: SqlWindow): Promise<PwaKpis> {
  const [row] = await prisma.$queryRaw<PwaKpis[]>`
    select
      count(distinct i.profile_id)::int as users,
      count(*)::int as installs,
      count(*) filter (where i.platform = 'android')::int as android,
      count(*) filter (where i.platform = 'ios')::int as ios,
      count(*) filter (where i.platform = 'desktop')::int as desktop,
      count(*) filter (where i.installed_at >= ${w.since})::int as new_installs,
      count(*) filter (where i.installed_at >= ${w.prevSince} and i.installed_at < ${w.since})::int as new_installs_prev,
      count(distinct i.profile_id) filter (where i.last_seen_at >= now() - interval '7 days')::int as active_7d,
      count(distinct i.profile_id) filter (
        where exists (select 1 from push_subscriptions p where p.profile_id = i.profile_id)
      )::int as with_push,
      (select count(*)::int from profiles where deleted_at is null) as profiles
    from pwa_installs i
  `;
  return (
    row ?? {
      users: 0,
      installs: 0,
      android: 0,
      ios: 0,
      desktop: 0,
      new_installs: 0,
      new_installs_prev: 0,
      active_7d: 0,
      with_push: 0,
      profiles: 0,
    }
  );
}

export type PwaSeriesRow = { bucket: string; installs: number; users: number };

/** New installs per bucket, zero-filled. Counts first observations only. */
export async function pwaSeries(w: SqlWindow): Promise<PwaSeriesRow[]> {
  return prisma.$queryRaw<PwaSeriesRow[]>`
    with buckets as (
      select generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as b
    ),
    i as (
      select date_trunc(${w.bucket}, installed_at) as b,
             count(*)::int as installs,
             count(distinct profile_id)::int as users
      from pwa_installs where installed_at >= ${w.since} group by 1
    )
    select to_char(buckets.b, 'YYYY-MM-DD') as bucket,
           coalesce(i.installs, 0) as installs,
           coalesce(i.users, 0) as users
    from buckets left join i on i.b = buckets.b
    order by buckets.b
  `;
}

export type PwaUserRow = {
  nickname: string | null;
  wallet: string;
  /** Every platform this profile has the app on, comma-separated. */
  platforms: string;
  installed_at: Date;
  last_seen_at: Date;
  /** Whether the same profile has a push device registered. */
  push: boolean;
};

export type PwaUsersPage = {
  rows: PwaUserRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/**
 * One page of the people who have the app installed.
 *
 * Grouped by profile, not by row: the table's grain is (profile, platform), but
 * the list answers "who has it", so two platforms collapse into one line with
 * both named. `installed_at` is therefore the earliest install and
 * `last_seen_at` the most recent launch across all of them.
 *
 * `LIMIT`/`OFFSET` and `count(*) over ()` are in the SQL rather than applied to
 * a fetched-everything array — the same rule `depositorsPage` follows. The
 * count is over profiles, matching the rows returned, so the pager's total is
 * not silently the row count of a different grain.
 *
 * Ignores the window on purpose. An install is a standing fact about a user;
 * "installed in the last 7 days" is what the chart above is for.
 */
export async function pwaUsersPage({ limit, offset }: { limit: number; offset: number }): Promise<PwaUsersPage> {
  const rows = await prisma.$queryRaw<(PwaUserRow & { total_count: number })[]>`
    with per_profile as (
      select i.profile_id,
             string_agg(distinct i.platform, ', ' order by i.platform) as platforms,
             min(i.installed_at) as installed_at,
             max(i.last_seen_at) as last_seen_at
      from pwa_installs i
      group by i.profile_id
    )
    select p.nickname,
           p.wallet_address as wallet,
           pp.platforms,
           pp.installed_at,
           pp.last_seen_at,
           exists (select 1 from push_subscriptions s where s.profile_id = pp.profile_id) as push,
           count(*) over ()::int as total_count
    from per_profile pp
    join profiles p on p.id = pp.profile_id
    order by pp.installed_at desc
    limit ${limit} offset ${offset}
  `;
  const total = rows[0]?.total_count ?? 0;
  return {
    rows: rows.map(({ total_count: _ignored, ...r }) => r),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  };
}
