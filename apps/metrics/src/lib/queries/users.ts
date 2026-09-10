import { prisma } from '@vaquita/db';
import type { SqlWindow } from './common';
import { hasVaultFlows, vaultDepositEvents } from './vault';

// Anything that asks "has this wallet started saving?" has to accept both
// products. The flexible vault is the option the deposit sheet offers FIRST to
// a user without a wallet, which is exactly the cohort a campaign acquires — so
// a locked-only definition reports the acquisition channel that works best as
// the one that converts worst.
//
// Two sources, and they cover different holes:
// - `vault_flows` is the event, with a timestamp, so it can answer "within 7
//   days of signing up". It only goes back to the day the ledger shipped.
// - `wallet_balances.vault_usdc` is a balance with no history, so it can only
//   answer "ever". It is what still counts the savers who funded the vault
//   before the ledger existed, and what covers a write the browser dropped.
//
// Filtered to supported tokens throughout: production carries stale rows for a
// retired token pointed at the same DeFindex vault, so an unscoped read counts
// those wallets twice.

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
  const flows = vaultDepositEvents(await hasVaultFlows());
  const [row] = await prisma.$queryRaw<UserKpis[]>`
    with supported as (
      select id from tokens where is_supported = true and deleted_at is null
    ),
    -- Holds flexible USDC now. No timestamp exists for it, so it can only ever
    -- answer "did this wallet save at all".
    vault_holders as (
      select distinct wallet_address from wallet_balances
      where token_id in (select id from supported) and vault_usdc > 0
    ),
    -- Every dated "the user put money in", both products in one relation.
    saved as (
      select wallet_address, coalesce(confirmed_at, created_at) as ts
      from deposits where deleted_at is null and status = 'confirmed'
      union all
      select wallet_address, ts from ${flows} f
    )
    select
      (select count(*) from profiles where deleted_at is null)::int as total_users,
      (select count(*) from profiles where deleted_at is null and created_at >= ${w.since})::int as new_users,
      (select count(*) from profiles where deleted_at is null and created_at >= ${w.prevSince} and created_at < ${w.since})::int as new_users_prev,
      (select count(*) from profiles where deleted_at is null and onboarding_completed)::int as onboarded,
      (select count(*) from profiles where deleted_at is null and tutorial_completed)::int as tutorial_done,
      (select count(*) from (
         select wallet_address from saved union select wallet_address from vault_holders
       ) x)::int as depositors_ever,
      (select count(*) from profiles where deleted_at is null and referred_by_id is not null)::int as referred,
      (select count(distinct wallet_address) from saved where ts >= ${w.since})::int as active_depositors,
      (select count(distinct wallet_address) from saved
         where ts >= ${w.prevSince} and ts < ${w.since})::int as active_depositors_prev,
      (select count(*) from profiles p where p.deleted_at is null and p.created_at >= ${w.since})::int as activation_cohort,
      -- Dated sources only. A balance cannot say whether it arrived inside the
      -- seven days, and guessing "yes" would quietly inflate the headline.
      (select count(*) from profiles p where p.deleted_at is null and p.created_at >= ${w.since}
         and exists (select 1 from saved s where s.wallet_address = p.wallet_address
                       and s.ts <= p.created_at + interval '7 days'))::int as activated_7d,
      (select count(*) from profiles p where p.deleted_at is null and p.created_at >= ${w.since}
         and (exists (select 1 from saved s where s.wallet_address = p.wallet_address)
              or exists (select 1 from vault_holders v where v.wallet_address = p.wallet_address)))::int as activated_ever
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
  const flows = vaultDepositEvents(await hasVaultFlows());
  return prisma.$queryRaw<ReferrerRow[]>`
    with supported as (
      select id from tokens where is_supported = true and deleted_at is null
    ),
    vault_holders as (
      select distinct wallet_address from wallet_balances
      where token_id in (select id from supported) and vault_usdc > 0
    ),
    saved as (
      select wallet_address from deposits where deleted_at is null and status = 'confirmed'
      union all
      select wallet_address from ${flows} f
    )
    select r.nickname,
           r.wallet_address as wallet,
           count(*)::int as referrals,
           count(*) filter (where p.created_at >= ${w.since})::int as in_range,
           -- Same definition of "activated" as the KPI tiles: a referral who
           -- funded the flexible vault converted just as much as one who locked.
           count(*) filter (where exists (select 1 from saved s where s.wallet_address = p.wallet_address)
                              or exists (select 1 from vault_holders v where v.wallet_address = p.wallet_address))::int as activated
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
  const flows = vaultDepositEvents(await hasVaultFlows());
  const [r] = await prisma.$queryRaw<{ signed_up: number; onboarded: number; attempted: number; confirmed: number }[]>`
    with supported as (
      select id from tokens where is_supported = true and deleted_at is null
    ),
    vault_holders as (
      select distinct wallet_address from wallet_balances
      where token_id in (select id from supported) and vault_usdc > 0
    ),
    saved as (
      select wallet_address from deposits where deleted_at is null and status = 'confirmed'
      union all
      select wallet_address from ${flows} f
    ),
    -- "Tried" means a row exists at all, confirmed or not. The flexible product
    -- writes only on a transaction the chain already accepted, so it has no
    -- failed attempts to contribute here: its rows land in both steps.
    tried as (
      select wallet_address from deposits where deleted_at is null
      union all
      select wallet_address from saved
    )
    select count(*)::int as signed_up,
           count(*) filter (where onboarding_completed)::int as onboarded,
           count(*) filter (where exists (select 1 from tried t where t.wallet_address = p.wallet_address))::int as attempted,
           count(*) filter (where exists (select 1 from saved s where s.wallet_address = p.wallet_address)
                               or exists (select 1 from vault_holders v where v.wallet_address = p.wallet_address))::int as confirmed
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
