import { prisma } from '@vaquita/db';
import type { SqlWindow } from './common';

export type CohortCell = { cohort: string; size: number; offset_weeks: number; active: number };

/**
 * Weekly deposit cohorts: cohort = ISO week of a wallet's FIRST confirmed
 * deposit; a cell counts wallets of that cohort with a confirmed deposit
 * `offset_weeks` later (week 0 is always 100%).
 */
export async function depositCohorts(w: SqlWindow): Promise<CohortCell[]> {
  return prisma.$queryRaw<CohortCell[]>`
    with c as (
      select wallet_address, coalesce(confirmed_at, created_at) as ts
      from deposits where deleted_at is null and status = 'confirmed'
    ),
    first as (
      select wallet_address, date_trunc('week', min(ts)) as cohort from c group by 1
    ),
    firsts as (select wallet_address, min(ts) as first_ts from c group by 1),
    -- repeat deposits only: the first deposit defines the cohort and is not "coming back"
    acts as (
      select distinct c.wallet_address, date_trunc('week', c.ts) as wk
      from c join firsts m on m.wallet_address = c.wallet_address
      where c.ts > m.first_ts
    )
    select to_char(f.cohort, 'YYYY-MM-DD') as cohort,
           (select count(*) from first f2 where f2.cohort = f.cohort)::int as size,
           coalesce(floor(extract(epoch from (a.wk - f.cohort)) / 604800), 0)::int as offset_weeks,
           count(distinct a.wallet_address)::int as active
    from first f left join acts a on a.wallet_address = f.wallet_address
    where f.cohort >= date_trunc('week', ${w.since}::timestamptz)
    group by f.cohort, offset_weeks
    order by f.cohort, offset_weeks
  `;
}

export type WithdrawalSeriesRow = {
  bucket: string;
  early: number;
  on_time: number;
  early_principal: number;
  on_time_principal: number;
};

const EARLY = `coalesce(w.confirmed_at, w.created_at) < coalesce(d.confirmed_at, d.created_at) + (coalesce(d.lock_period, 0)::float8 / 1000) * interval '1 second'`;

export async function withdrawalSeries(w: SqlWindow): Promise<WithdrawalSeriesRow[]> {
  // The early/on-time predicate is a fixed string, so it is inlined via $queryRawUnsafe
  // with positional params — no user input reaches the SQL text.
  return prisma.$queryRawUnsafe<WithdrawalSeriesRow[]>(
    `
    with buckets as (
      select generate_series(date_trunc($1, $2::timestamptz), date_trunc($1, now()), $3::interval) as b
    ),
    x as (
      select date_trunc($1, coalesce(w.confirmed_at, w.created_at)) as b,
             (${EARLY}) as early,
             d.amount
      from withdrawals w join deposits d on d.id = w.deposit_id
      where w.deleted_at is null and w.status = 'confirmed' and coalesce(w.confirmed_at, w.created_at) >= $2
    )
    select to_char(buckets.b, 'YYYY-MM-DD') as bucket,
           count(x.b) filter (where x.early)::int as early,
           count(x.b) filter (where not x.early)::int as on_time,
           coalesce(sum(x.amount) filter (where x.early), 0)::float8 as early_principal,
           coalesce(sum(x.amount) filter (where not x.early), 0)::float8 as on_time_principal
    from buckets left join x on x.b = buckets.b
    group by buckets.b
    order by buckets.b
    `,
    w.bucket,
    w.since,
    w.step
  );
}

export type RetentionKpis = {
  withdrawals: number;
  early: number;
  principal_withdrawn: number;
  interest_paid: number;
  reward_paid: number;
  active_positions: number;
  matured_unclaimed: number;
  median_days_to_first_deposit: number | null;
  returning_depositors: number;
  depositors: number;
};

export async function retentionKpis(w: SqlWindow): Promise<RetentionKpis> {
  const [row] = await prisma.$queryRaw<RetentionKpis[]>`
    with wd as (
      select w.*, d.amount as principal,
             (coalesce(w.confirmed_at, w.created_at) < coalesce(d.confirmed_at, d.created_at) + (coalesce(d.lock_period, 0)::float8 / 1000) * interval '1 second') as early
      from withdrawals w join deposits d on d.id = w.deposit_id
      where w.deleted_at is null and w.status = 'confirmed' and coalesce(w.confirmed_at, w.created_at) >= ${w.since}
    ),
    open as (
      select d.* from deposits d
      where d.deleted_at is null and d.status = 'confirmed'
        and not exists (select 1 from withdrawals w where w.deposit_id = d.id and w.deleted_at is null and w.status = 'confirmed')
    ),
    firsts as (
      select p.id, extract(epoch from (min(coalesce(d.confirmed_at, d.created_at)) - p.created_at)) / 86400 as days
      from profiles p join deposits d on d.wallet_address = p.wallet_address and d.deleted_at is null and d.status = 'confirmed'
      where p.deleted_at is null and p.created_at >= ${w.since}
      group by p.id, p.created_at
    ),
    per_wallet as (
      select wallet_address, count(*) as n from deposits
      where deleted_at is null and status = 'confirmed' and coalesce(confirmed_at, created_at) >= ${w.since}
      group by 1
    )
    select
      (select count(*) from wd)::int as withdrawals,
      (select count(*) from wd where early)::int as early,
      (select coalesce(sum(principal), 0) from wd)::float8 as principal_withdrawn,
      (select coalesce(sum(interest), 0) from wd)::float8 as interest_paid,
      (select coalesce(sum(reward), 0) from wd)::float8 as reward_paid,
      (select count(*) from open)::int as active_positions,
      (select count(*) from open where coalesce(confirmed_at, created_at) + (coalesce(lock_period, 0)::float8 / 1000) * interval '1 second' <= now())::int as matured_unclaimed,
      (select percentile_cont(0.5) within group (order by days) from firsts)::float8 as median_days_to_first_deposit,
      (select count(*) from per_wallet where n >= 2)::int as returning_depositors,
      (select count(*) from per_wallet)::int as depositors
  `;
  return row!;
}
