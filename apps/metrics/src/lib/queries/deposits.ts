import { prisma } from '@vaquita/db';
import type { SqlWindow } from './common';

export type DepositSeriesRow = {
  bucket: string;
  deposits: number;
  volume: number;
  depositors: number;
  withdrawals: number;
  withdrawn: number;
  /** Locked principal at the end of the bucket (deposits − withdrawn principal, cumulative). */
  tvl: number;
};

/** Confirmed deposits/withdrawals per bucket (zero-filled) and the resulting locked-principal curve. */
export async function depositSeries(w: SqlWindow): Promise<DepositSeriesRow[]> {
  const rows = await prisma.$queryRaw<Omit<DepositSeriesRow, 'tvl'>[]>`
    with buckets as (
      select generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as b
    ),
    d as (
      select date_trunc(${w.bucket}, coalesce(confirmed_at, created_at)) as b,
             count(*)::int as n,
             sum(amount)::float8 as vol,
             count(distinct wallet_address)::int as wallets
      from deposits
      where deleted_at is null and status = 'confirmed' and coalesce(confirmed_at, created_at) >= ${w.since}
      group by 1
    ),
    wd as (
      select date_trunc(${w.bucket}, coalesce(w.confirmed_at, w.created_at)) as b,
             count(*)::int as n,
             sum(d.amount)::float8 as principal
      from withdrawals w join deposits d on d.id = w.deposit_id
      where w.deleted_at is null and w.status = 'confirmed' and coalesce(w.confirmed_at, w.created_at) >= ${w.since}
      group by 1
    )
    select to_char(buckets.b, 'YYYY-MM-DD') as bucket,
           coalesce(d.n, 0) as deposits,
           coalesce(d.vol, 0)::float8 as volume,
           coalesce(d.wallets, 0) as depositors,
           coalesce(wd.n, 0) as withdrawals,
           coalesce(wd.principal, 0)::float8 as withdrawn
    from buckets left join d on d.b = buckets.b left join wd on wd.b = buckets.b
    order by buckets.b
  `;
  const [base] = await prisma.$queryRaw<{ tvl: number }[]>`
    select (
      (select coalesce(sum(amount), 0) from deposits
         where deleted_at is null and status = 'confirmed' and coalesce(confirmed_at, created_at) < ${w.since})
      - (select coalesce(sum(d.amount), 0) from withdrawals w join deposits d on d.id = w.deposit_id
         where w.deleted_at is null and w.status = 'confirmed' and coalesce(w.confirmed_at, w.created_at) < ${w.since})
    )::float8 as tvl
  `;
  let tvl = base?.tvl ?? 0;
  return rows.map((r) => {
    tvl += r.volume - r.withdrawn;
    return { ...r, tvl: Math.round(tvl * 100) / 100 };
  });
}

export type DepositKpis = {
  count: number;
  count_prev: number;
  volume: number;
  volume_prev: number;
  depositors: number;
  depositors_prev: number;
  avg_ticket: number;
  tvl: number;
  active_positions: number;
  volume_all: number;
  count_all: number;
  repeat_wallets: number;
  wallets_all: number;
  failed: number;
  initiated: number;
};

export async function depositKpis(w: SqlWindow): Promise<DepositKpis> {
  const [row] = await prisma.$queryRaw<DepositKpis[]>`
    with c as (
      select * from deposits where deleted_at is null and status = 'confirmed'
    ),
    withdrawn as (
      select d.id from withdrawals w join deposits d on d.id = w.deposit_id where w.deleted_at is null and w.status = 'confirmed'
    )
    select
      (select count(*) from c where coalesce(confirmed_at, created_at) >= ${w.since})::int as count,
      (select count(*) from c where coalesce(confirmed_at, created_at) >= ${w.prevSince} and coalesce(confirmed_at, created_at) < ${w.since})::int as count_prev,
      (select coalesce(sum(amount), 0) from c where coalesce(confirmed_at, created_at) >= ${w.since})::float8 as volume,
      (select coalesce(sum(amount), 0) from c where coalesce(confirmed_at, created_at) >= ${w.prevSince} and coalesce(confirmed_at, created_at) < ${w.since})::float8 as volume_prev,
      (select count(distinct wallet_address) from c where coalesce(confirmed_at, created_at) >= ${w.since})::int as depositors,
      (select count(distinct wallet_address) from c where coalesce(confirmed_at, created_at) >= ${w.prevSince} and coalesce(confirmed_at, created_at) < ${w.since})::int as depositors_prev,
      (select coalesce(avg(amount), 0) from c where coalesce(confirmed_at, created_at) >= ${w.since})::float8 as avg_ticket,
      (select coalesce(sum(amount), 0) from c where id not in (select id from withdrawn))::float8 as tvl,
      (select count(*) from c where id not in (select id from withdrawn))::int as active_positions,
      (select coalesce(sum(amount), 0) from c)::float8 as volume_all,
      (select count(*) from c)::int as count_all,
      (select count(*) from (select wallet_address from c group by 1 having count(*) >= 2) x)::int as repeat_wallets,
      (select count(distinct wallet_address) from c)::int as wallets_all,
      (select count(*) from deposits where deleted_at is null and status = 'failed' and created_at >= ${w.since})::int as failed,
      (select count(*) from deposits where deleted_at is null and status = 'initiated' and created_at >= ${w.since})::int as initiated
  `;
  return row!;
}

export type LockPeriodRow = { lock_period_ms: number; deposits: number; volume: number; active: number };

export async function byLockPeriod(w: SqlWindow): Promise<LockPeriodRow[]> {
  return prisma.$queryRaw<LockPeriodRow[]>`
    select coalesce(d.lock_period, 0)::float8 as lock_period_ms,
           count(*)::int as deposits,
           sum(d.amount)::float8 as volume,
           count(*) filter (where not exists (select 1 from withdrawals w where w.deposit_id = d.id and w.deleted_at is null and w.status = 'confirmed'))::int as active
    from deposits d
    where d.deleted_at is null and d.status = 'confirmed' and coalesce(d.confirmed_at, d.created_at) >= ${w.since}
    group by 1
    order by 1
  `;
}

export type TopDepositorRow = {
  wallet: string;
  nickname: string | null;
  deposits: number;
  volume: number;
  first_deposit: string;
};

export async function topDepositors(w: SqlWindow): Promise<TopDepositorRow[]> {
  return prisma.$queryRaw<TopDepositorRow[]>`
    select d.wallet_address as wallet,
           p.nickname,
           count(*)::int as deposits,
           sum(d.amount)::float8 as volume,
           to_char(min(coalesce(d.confirmed_at, d.created_at)), 'YYYY-MM-DD') as first_deposit
    from deposits d
    left join profiles p on p.wallet_address = d.wallet_address and p.deleted_at is null
    where d.deleted_at is null and d.status = 'confirmed' and coalesce(d.confirmed_at, d.created_at) >= ${w.since}
    group by d.wallet_address, p.nickname
    order by volume desc
    limit 15
  `;
}
