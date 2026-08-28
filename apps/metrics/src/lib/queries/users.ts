import { prisma } from '@vaquita/db';
import type { SqlWindow } from './common';

export type SignupRow = { bucket: string; signups: number; total: number; referred: number };

/** New profiles per bucket (zero-filled) plus the running total of all profiles. */
export async function signupSeries(w: SqlWindow): Promise<SignupRow[]> {
  return prisma.$queryRaw<SignupRow[]>`
    with buckets as (
      select generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as b
    ),
    s as (
      select date_trunc(${w.bucket}, created_at) as b,
             count(*)::int as n,
             count(*) filter (where referred_by_id is not null)::int as referred
      from profiles
      where deleted_at is null and created_at >= ${w.since}
      group by 1
    ),
    base as (
      select count(*)::int as n from profiles where deleted_at is null and created_at < ${w.since}
    )
    select to_char(buckets.b, 'YYYY-MM-DD') as bucket,
           coalesce(s.n, 0) as signups,
           coalesce(s.referred, 0) as referred,
           ((select n from base) + sum(coalesce(s.n, 0)) over (order by buckets.b))::int as total
    from buckets left join s on s.b = buckets.b
    order by buckets.b
  `;
}

export type UserKpis = {
  total_users: number;
  new_users: number;
  new_users_prev: number;
  onboarded: number;
  tutorial_done: number;
  depositors_ever: number;
  referred: number;
  active_depositors: number;
  active_depositors_prev: number;
  activation_cohort: number;
  activated_7d: number;
  activated_ever: number;
};

export async function userKpis(w: SqlWindow): Promise<UserKpis> {
  const [row] = await prisma.$queryRaw<UserKpis[]>`
    select
      (select count(*) from profiles where deleted_at is null)::int as total_users,
      (select count(*) from profiles where deleted_at is null and created_at >= ${w.since})::int as new_users,
      (select count(*) from profiles where deleted_at is null and created_at >= ${w.prevSince} and created_at < ${w.since})::int as new_users_prev,
      (select count(*) from profiles where deleted_at is null and onboarding_completed)::int as onboarded,
      (select count(*) from profiles where deleted_at is null and tutorial_completed)::int as tutorial_done,
      (select count(distinct wallet_address) from deposits where deleted_at is null and status = 'confirmed')::int as depositors_ever,
      (select count(*) from profiles where deleted_at is null and referred_by_id is not null)::int as referred,
      (select count(distinct wallet_address) from deposits
         where deleted_at is null and status = 'confirmed' and coalesce(confirmed_at, created_at) >= ${w.since})::int as active_depositors,
      (select count(distinct wallet_address) from deposits
         where deleted_at is null and status = 'confirmed'
           and coalesce(confirmed_at, created_at) >= ${w.prevSince} and coalesce(confirmed_at, created_at) < ${w.since})::int as active_depositors_prev,
      (select count(*) from profiles p where p.deleted_at is null and p.created_at >= ${w.since})::int as activation_cohort,
      (select count(*) from profiles p where p.deleted_at is null and p.created_at >= ${w.since}
         and exists (select 1 from deposits d where d.wallet_address = p.wallet_address and d.deleted_at is null
                       and d.status = 'confirmed' and coalesce(d.confirmed_at, d.created_at) <= p.created_at + interval '7 days'))::int as activated_7d,
      (select count(*) from profiles p where p.deleted_at is null and p.created_at >= ${w.since}
         and exists (select 1 from deposits d where d.wallet_address = p.wallet_address and d.deleted_at is null
                       and d.status = 'confirmed'))::int as activated_ever
  `;
  return row!;
}

export type ReferrerRow = {
  nickname: string | null;
  wallet: string;
  referrals: number;
  in_range: number;
  activated: number;
};

export async function topReferrers(w: SqlWindow): Promise<ReferrerRow[]> {
  return prisma.$queryRaw<ReferrerRow[]>`
    select r.nickname,
           r.wallet_address as wallet,
           count(*)::int as referrals,
           count(*) filter (where p.created_at >= ${w.since})::int as in_range,
           count(*) filter (where exists (select 1 from deposits d where d.wallet_address = p.wallet_address
                                            and d.deleted_at is null and d.status = 'confirmed'))::int as activated
    from profiles p
    join profiles r on r.id = p.referred_by_id
    where p.deleted_at is null
    group by r.id, r.nickname, r.wallet_address
    order by referrals desc, activated desc
    limit 15
  `;
}

export type FunnelRow = { step: string; users: number };

/** Signup → onboarding → first deposit attempt → first confirmed deposit, for profiles created in the window. */
export async function signupFunnel(w: SqlWindow): Promise<FunnelRow[]> {
  const [r] = await prisma.$queryRaw<{ signed_up: number; onboarded: number; attempted: number; confirmed: number }[]>`
    select count(*)::int as signed_up,
           count(*) filter (where onboarding_completed)::int as onboarded,
           count(*) filter (where exists (select 1 from deposits d where d.wallet_address = p.wallet_address and d.deleted_at is null))::int as attempted,
           count(*) filter (where exists (select 1 from deposits d where d.wallet_address = p.wallet_address and d.deleted_at is null and d.status = 'confirmed'))::int as confirmed
    from profiles p
    where p.deleted_at is null and p.created_at >= ${w.since}
  `;
  return [
    { step: 'Signed up', users: r?.signed_up ?? 0 },
    { step: 'Onboarded', users: r?.onboarded ?? 0 },
    { step: 'Tried a deposit', users: r?.attempted ?? 0 },
    { step: 'Deposit confirmed', users: r?.confirmed ?? 0 },
  ];
}
