import { Prisma, prisma } from '@vaquita/db';
import type { SqlWindow } from './common';

// Fiat on-ramp (local currency → USDC) and off-ramp (USDC → local currency).
//
// Two asymmetries drive the shape of everything here:
//
//  1. `amount_fiat` is in the corridor's own currency (ARS, BOB, …), so summing
//     it across rows is meaningless. Fiat volume is only ever reported grouped
//     BY currency. `offramp_withdrawals.usdc_amount` is comparable across
//     corridors, so that one is summed freely.
//  2. Both amount columns are varchar (the client reports them as strings), so
//     every arithmetic use needs an explicit ::numeric cast.
//
// An off-ramp row is opened BEFORE the USDC leaves the vault, so a row stuck on
// step 'funds'/'create' is the one that matters operationally: money may have
// moved without a payout ever being created. That is the `stuck` KPI.
//
// The two tables speak different status vocabularies and they must not be
// merged: on-ramp is 'pending' | 'paid' | 'settled' | 'expired' | 'failed' |
// 'cancelled', off-ramp is 'pending' | 'settled' | 'failed' | 'abandoned'.
// Only 'settled' and the open states are named here; everything else is one
// `unsettled` bucket, so a status a provider adds tomorrow still lands in a
// settle rate instead of vanishing from the denominator.
//
// Open means 'pending' or 'paid' on the on-ramp side, matching the partial index
// the table carries and the repository's own open-row filter. In practice only
// 'pending' occurs: nothing in the product writes 'paid'. Open rows are counted
// apart from unsettled ones because they have not failed — they have not
// finished, which is a different question.
//
// Nothing ever closes an open on-ramp row. There is no job that expires one, and
// the lazy sweep in `findPendingOnrampPurchase` only fires when that same wallet
// re-reads its own purchase. So a purchase settled by hand outside the platform
// stays open forever, which is why the age of an open row is worth showing.

// Both amount columns are client-reported varchar, so a row can hold anything a
// provider once put in it. A plain ::numeric cast on a stray value would fail the
// entire statement and blank the page; these read non-numeric entries as 0 so one
// malformed row cannot take the dashboard down with it.
const FIAT = Prisma.raw("(case when amount_fiat ~ '^-?[0-9]+(\\.[0-9]+)?$' then amount_fiat::numeric else 0 end)");
const USDC = Prisma.raw("(case when usdc_amount ~ '^-?[0-9]+(\\.[0-9]+)?$' then usdc_amount::numeric else 0 end)");

/** Which ramp tables exist here — both migrations are applied by hand per environment. */
export async function rampTables(): Promise<{ onramp: boolean; offramp: boolean }> {
  const [row] = await prisma.$queryRaw<{ onramp: boolean; offramp: boolean }[]>`
    select to_regclass('public.onramp_purchases') is not null as onramp,
           to_regclass('public.offramp_withdrawals') is not null as offramp
  `;
  return { onramp: row?.onramp ?? false, offramp: row?.offramp ?? false };
}

export type OnrampKpis = {
  started: number;
  started_prev: number;
  settled: number;
  settled_prev: number;
  /** Reached a terminal state other than settled: expired, failed or cancelled. */
  unsettled: number;
  /** Still open right now, at any age. A stock, not a flow: never windowed. */
  pending: number;
  /** Age in days of the oldest open purchase, 0 when there are none. */
  pending_oldest_days: number;
  wallets: number;
  settled_all: number;
};

export async function onrampKpis(w: SqlWindow): Promise<OnrampKpis> {
  const [row] = await prisma.$queryRaw<OnrampKpis[]>`
    with r as (select * from onramp_purchases where deleted_at is null)
    select
      (select count(*) from r where created_at >= ${w.since})::int as started,
      (select count(*) from r where created_at >= ${w.prevSince} and created_at < ${w.since})::int as started_prev,
      (select count(*) from r where status = 'settled' and updated_at >= ${w.since})::int as settled,
      (select count(*) from r where status = 'settled' and updated_at >= ${w.prevSince} and updated_at < ${w.since})::int as settled_prev,
      (select count(*) from r where status not in ('settled', 'pending', 'paid') and updated_at >= ${w.since})::int as unsettled,
      (select count(*) from r where status in ('pending', 'paid'))::int as pending,
      (select coalesce(max(extract(epoch from now() - created_at)) / 86400, 0) from r where status in ('pending', 'paid'))::float8 as pending_oldest_days,
      (select count(distinct wallet_address) from r where status = 'settled' and updated_at >= ${w.since})::int as wallets,
      (select count(*) from r where status = 'settled')::int as settled_all
  `;
  return row!;
}

export type OfframpKpis = {
  started: number;
  started_prev: number;
  settled: number;
  settled_prev: number;
  usdc: number;
  usdc_prev: number;
  /** Reached a terminal state other than settled: failed, expired, cancelled or abandoned. */
  unsettled: number;
  pending: number;
  /**
   * Rows older than an hour that never settled and never reached the payout step —
   * USDC may have left the vault with no payout behind it. The age filter keeps
   * withdrawals that are merely mid-flight right now out of the alarm count.
   */
  stuck: number;
  wallets: number;
  settled_all: number;
};

export async function offrampKpis(w: SqlWindow): Promise<OfframpKpis> {
  const [row] = await prisma.$queryRaw<OfframpKpis[]>`
    with r as (select * from offramp_withdrawals where deleted_at is null)
    select
      (select count(*) from r where created_at >= ${w.since})::int as started,
      (select count(*) from r where created_at >= ${w.prevSince} and created_at < ${w.since})::int as started_prev,
      (select count(*) from r where status = 'settled' and updated_at >= ${w.since})::int as settled,
      (select count(*) from r where status = 'settled' and updated_at >= ${w.prevSince} and updated_at < ${w.since})::int as settled_prev,
      (select coalesce(sum(${USDC}), 0) from r where status = 'settled' and updated_at >= ${w.since})::float8 as usdc,
      (select coalesce(sum(${USDC}), 0) from r where status = 'settled' and updated_at >= ${w.prevSince} and updated_at < ${w.since})::float8 as usdc_prev,
      (select count(*) from r where status not in ('settled', 'pending') and updated_at >= ${w.since})::int as unsettled,
      (select count(*) from r where status = 'pending')::int as pending,
      (select count(*) from r where status <> 'settled' and step <> 'payout' and created_at < now() - interval '1 hour')::int as stuck,
      (select count(distinct wallet_address) from r where status = 'settled' and updated_at >= ${w.since})::int as wallets,
      (select count(*) from r where status = 'settled')::int as settled_all
  `;
  return row!;
}

export type RampSeriesRow = {
  bucket: string;
  onramp_started: number;
  onramp_settled: number;
  /**
   * Of the purchases opened in this bucket, how many are STILL open today.
   *
   * Residue, not a flow: it is the only series here that changes meaning as time
   * passes, because a bucket's figure falls whenever one of its purchases finally
   * closes. It reads as "what this day left behind", and since nothing expires an
   * on-ramp row on its own, a bucket that stays high is where to look for
   * purchases resolved off the platform.
   */
  onramp_pending: number;
  offramp_started: number;
  offramp_settled: number;
  /** Settled off-ramp USDC per bucket. On-ramp has no comparable column (fiat is per-currency). */
  offramp_usdc: number;
};

/**
 * Both ramps per bucket, zero-filled. Started is bucketed by `created_at` and
 * settled by `updated_at`, so a purchase opened on Monday and settled on Tuesday
 * counts once in each — which is what a funnel over time should show.
 *
 * Takes the availability flags rather than probing: a page renders several of
 * these and the probe is the caller's business.
 */
export async function rampSeries(
  w: SqlWindow,
  tables: { onramp: boolean; offramp: boolean }
): Promise<RampSeriesRow[]> {
  const buckets = await prisma.$queryRaw<{ bucket: string }[]>`
    select to_char(b, 'YYYY-MM-DD') as bucket
    from generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as b
    order by b
  `;

  const on = tables.onramp
    ? await prisma.$queryRaw<{ bucket: string; started: number; settled: number; pending: number }[]>`
        with s as (
          select date_trunc(${w.bucket}, created_at) as b, count(*)::int as n,
                 count(*) filter (where status in ('pending', 'paid'))::int as p
          from onramp_purchases where deleted_at is null and created_at >= ${w.since} group by 1
        ),
        d as (
          select date_trunc(${w.bucket}, updated_at) as b, count(*)::int as n
          from onramp_purchases where deleted_at is null and status = 'settled' and updated_at >= ${w.since} group by 1
        )
        select to_char(coalesce(s.b, d.b), 'YYYY-MM-DD') as bucket,
               coalesce(s.n, 0) as started, coalesce(d.n, 0) as settled, coalesce(s.p, 0) as pending
        from s full outer join d on d.b = s.b
      `
    : [];

  const off = tables.offramp
    ? await prisma.$queryRaw<{ bucket: string; started: number; settled: number; usdc: number }[]>`
        with s as (
          select date_trunc(${w.bucket}, created_at) as b, count(*)::int as n
          from offramp_withdrawals where deleted_at is null and created_at >= ${w.since} group by 1
        ),
        d as (
          select date_trunc(${w.bucket}, updated_at) as b, count(*)::int as n,
                 coalesce(sum(${USDC}), 0)::float8 as usdc
          from offramp_withdrawals where deleted_at is null and status = 'settled' and updated_at >= ${w.since} group by 1
        )
        select to_char(coalesce(s.b, d.b), 'YYYY-MM-DD') as bucket,
               coalesce(s.n, 0) as started, coalesce(d.n, 0) as settled, coalesce(d.usdc, 0)::float8 as usdc
        from s full outer join d on d.b = s.b
      `
    : [];

  const onBy = new Map(on.map((r) => [r.bucket, r]));
  const offBy = new Map(off.map((r) => [r.bucket, r]));
  return buckets.map(({ bucket }) => ({
    bucket,
    onramp_started: onBy.get(bucket)?.started ?? 0,
    onramp_settled: onBy.get(bucket)?.settled ?? 0,
    onramp_pending: onBy.get(bucket)?.pending ?? 0,
    offramp_started: offBy.get(bucket)?.started ?? 0,
    offramp_settled: offBy.get(bucket)?.settled ?? 0,
    offramp_usdc: offBy.get(bucket)?.usdc ?? 0,
  }));
}

export type CorridorRow = {
  corridor: string;
  currency: string;
  started: number;
  settled: number;
  /** Started in the window and still open. Windowed, unlike the pending KPI. */
  pending: number;
  fiat: number;
  fiat_pending: number;
};

/**
 * One row per (country, currency) corridor. `fiat` and `fiat_pending` are only
 * summable because the grouping pins the currency — never total either column
 * across rows.
 *
 * Everything here counts purchases STARTED in the window, pending included, so
 * the three counts read as one cohort: of what we opened, this settled, this is
 * still out. A purchase from before the window is absent even if it is still
 * open — the `pending` KPI is the lifetime figure, and the two disagreeing is
 * the point rather than a bug.
 */
export async function onrampCorridors(w: SqlWindow): Promise<CorridorRow[]> {
  return prisma.$queryRaw<CorridorRow[]>`
    select country || ' · ' || currency as corridor,
           currency,
           count(*)::int as started,
           count(*) filter (where status = 'settled')::int as settled,
           count(*) filter (where status in ('pending', 'paid'))::int as pending,
           coalesce(sum(${FIAT}) filter (where status = 'settled'), 0)::float8 as fiat,
           coalesce(sum(${FIAT}) filter (where status in ('pending', 'paid')), 0)::float8 as fiat_pending
    from onramp_purchases
    where deleted_at is null and created_at >= ${w.since}
    group by 1, 2
    order by started desc
    limit 20
  `;
}

export type OfframpCorridorRow = CorridorRow & { rail: string; usdc: number; usdc_pending: number };

/**
 * The off-ramp side of the same shape. Open here is 'pending' alone — this table
 * has no 'paid' state — and the figure that matters is `usdc_pending`, not the
 * fiat one: the row is opened before the USDC leaves the vault, so an open
 * withdrawal is money that may already be gone with no payout behind it. Unlike
 * fiat, USDC is comparable across corridors.
 */
export async function offrampCorridors(w: SqlWindow): Promise<OfframpCorridorRow[]> {
  return prisma.$queryRaw<OfframpCorridorRow[]>`
    select country || ' · ' || currency as corridor,
           currency,
           coalesce(rail, '—') as rail,
           count(*)::int as started,
           count(*) filter (where status = 'settled')::int as settled,
           count(*) filter (where status = 'pending')::int as pending,
           coalesce(sum(${FIAT}) filter (where status = 'settled'), 0)::float8 as fiat,
           coalesce(sum(${FIAT}) filter (where status = 'pending'), 0)::float8 as fiat_pending,
           coalesce(sum(${USDC}) filter (where status = 'settled'), 0)::float8 as usdc,
           coalesce(sum(${USDC}) filter (where status = 'pending'), 0)::float8 as usdc_pending
    from offramp_withdrawals
    where deleted_at is null and created_at >= ${w.since}
    group by 1, 2, 3
    order by started desc
    limit 20
  `;
}

export type StepRow = { step: string; count: number };

/**
 * Where unfinished off-ramps are parked. `funds` and `create` are the alarming
 * ones — the payout was never created, so the USDC may have moved with nothing
 * on the other side.
 */
export async function offrampStuckByStep(): Promise<StepRow[]> {
  return prisma.$queryRaw<StepRow[]>`
    select step, count(*)::int as count
    from offramp_withdrawals
    where deleted_at is null and status <> 'settled' and created_at < now() - interval '1 hour'
    group by 1
    order by 2 desc
  `;
}

export type OnrampAgeRow = { bucket: string; count: number };

/** The three age buckets, newest first. Fixed so an empty one still draws a bar. */
const ONRAMP_AGE_BUCKETS = ['Under a day', '1-7 days', 'Over a week'] as const;

/**
 * Every open on-ramp purchase, bucketed by how long it has been open.
 *
 * Deliberately unwindowed, like the `pending` KPI and unlike the corridor table:
 * this is a stock, and the whole reason to draw it is that the oldest rows are
 * the ones a range picker would hide. Nothing closes an open purchase on its own,
 * so age is the best proxy available for "this one was almost certainly resolved
 * off the platform and never written back".
 *
 * Zero-filled: a bucket with no rows draws empty rather than silently leaving the
 * chart, which would make three days of stale purchases look like a clean board.
 */
export async function onrampOpenByAge(): Promise<OnrampAgeRow[]> {
  const rows = await prisma.$queryRaw<OnrampAgeRow[]>`
    select case
             when created_at >= now() - interval '1 day' then 'Under a day'
             when created_at >= now() - interval '7 days' then '1-7 days'
             else 'Over a week'
           end as bucket,
           count(*)::int as count
    from onramp_purchases
    where deleted_at is null and status in ('pending', 'paid')
    group by 1
  `;
  const by = new Map(rows.map((r) => [r.bucket, r.count]));
  return ONRAMP_AGE_BUCKETS.map((bucket) => ({ bucket, count: by.get(bucket) ?? 0 }));
}
