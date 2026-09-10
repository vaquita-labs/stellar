import { prisma } from '@vaquita/db';
import type { SqlWindow } from './common';
import { hasVaultFlows, vaultDepositEvents } from './vault';

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

/** `lock_period_ms: null` is the flexible vault — no lock, so no period to name. */
export type LockPeriodRow = { lock_period_ms: number | null; deposits: number; volume: number; active: number };

/**
 * Volume by lock period, with the flexible vault as its own bucket.
 *
 * Without that bucket the chart reads as a breakdown of everything the product
 * took in, while showing only the half that gets locked — and the flexible side
 * is the one a user without a wallet reaches first.
 *
 * The two `active` columns are not the same measure and cannot be. A locked
 * position is open until it is withdrawn, so it counts rows; flexible shares are
 * fungible and no withdrawal maps back to a deposit, so the only honest figure
 * is how many wallets hold a balance right now. Hence "active" here means
 * "still in", counted the way each product allows.
 */
export async function byLockPeriod(w: SqlWindow): Promise<LockPeriodRow[]> {
  const flows = vaultDepositEvents(await hasVaultFlows());
  return prisma.$queryRaw<LockPeriodRow[]>`
    with supported as (
      select id from tokens where is_supported = true and deleted_at is null
    ),
    locked as (
      select coalesce(d.lock_period, 0)::float8 as lock_period_ms,
             count(*)::int as deposits,
             sum(d.amount)::float8 as volume,
             count(*) filter (where not exists (
               select 1 from withdrawals w
               where w.deposit_id = d.id and w.deleted_at is null and w.status = 'confirmed'
             ))::int as active
      from deposits d
      where d.deleted_at is null and d.status = 'confirmed' and coalesce(d.confirmed_at, d.created_at) >= ${w.since}
      group by 1
    ),
    flexible as (
      select null::float8 as lock_period_ms,
             count(*)::int as deposits,
             coalesce(sum(f.amount), 0)::float8 as volume,
             (select count(*)::int from wallet_balances wb
               where wb.token_id in (select id from supported) and wb.vault_usdc > 0) as active
      from ${flows} f
      where f.ts >= ${w.since}
    )
    select * from locked
    union all
    -- Only when the ledger has something to say. An empty flexible bar on an
    -- environment without the table would read as "nobody saves flexibly".
    select * from flexible where deposits > 0
    -- Nulls last: the lock-period axis stays in ascending order and the
    -- no-lock bucket sits at the end of it.
    order by lock_period_ms nulls last
  `;
}

export type DepositorRow = {
  wallet: string;
  nickname: string | null;
  /** Flexible balance supplied to the DeFindex vault, from the `wallet_balances` snapshot. */
  vault: number;
  /** Principal still locked in the pool: confirmed deposits with no confirmed withdrawal. */
  periods: number;
  total: number;
  deposits: number;
  first_deposit: string | null;
  /** When the vault figure was last read on-chain. Null for a wallet never scraped. */
  scraped_at: Date | null;
};

export type DepositorsPage = {
  rows: DepositorRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/**
 * One page of depositors, pool and vault side by side.
 *
 * A full outer join over the two sources, keyed on wallet address, because
 * neither one is a superset: a wallet that only supplied the vault has no
 * `deposits` row at all, and a wallet that only ever locked has no
 * `wallet_balances` row. Ranking either source alone silently hides half the
 * depositors — which is what the old `topDepositors` did.
 *
 * `LIMIT`/`OFFSET` and `count(*) over ()` are in the SQL, not applied to a
 * fetched-everything array: the point of paginating is that the database
 * returns one page, not that the page renders one.
 *
 * Two scoping rules, both load-bearing:
 * - The vault side is filtered to supported tokens. Rows survive a token being
 *   retired and production carried 45 stale rows on the same DeFindex vault as
 *   the live token, so an unscoped read double-counts.
 * - The `periods` side ignores the window and counts what is locked *now*.
 *   The window belongs to "how much was deposited in range" (the charts above);
 *   a balance is a balance.
 */
export async function depositorsPage(
  w: SqlWindow,
  { limit, offset }: { limit: number; offset: number },
): Promise<DepositorsPage> {
  const rows = await prisma.$queryRaw<(DepositorRow & { total_count: number })[]>`
    with supported as (
      select id from tokens where is_supported = true and deleted_at is null
    ),
    v as (
      select wb.wallet_address as wallet,
             sum(wb.vault_usdc)::float8 as vault,
             max(wb.scraped_at) as scraped_at
      from wallet_balances wb
      where wb.token_id in (select id from supported)
      group by wb.wallet_address
    ),
    d as (
      select d.wallet_address as wallet,
             count(*) filter (where coalesce(d.confirmed_at, d.created_at) >= ${w.since})::int as deposits,
             coalesce(sum(d.amount) filter (
               where not exists (
                 select 1 from withdrawals wd
                 where wd.deposit_id = d.id and wd.deleted_at is null and wd.status = 'confirmed'
               )
             ), 0)::float8 as periods,
             min(coalesce(d.confirmed_at, d.created_at)) as first_deposit
      from deposits d
      where d.deleted_at is null and d.status = 'confirmed'
      group by d.wallet_address
    ),
    j as (
      select coalesce(v.wallet, d.wallet) as wallet,
             coalesce(v.vault, 0)::float8 as vault,
             coalesce(d.periods, 0)::float8 as periods,
             coalesce(d.deposits, 0)::int as deposits,
             d.first_deposit,
             v.scraped_at
      from v full outer join d on d.wallet = v.wallet
    )
    select j.wallet,
           p.nickname,
           j.vault,
           j.periods,
           (j.vault + j.periods)::float8 as total,
           j.deposits,
           to_char(j.first_deposit, 'YYYY-MM-DD') as first_deposit,
           j.scraped_at,
           count(*) over ()::int as total_count
    from j
    left join profiles p on p.wallet_address = j.wallet and p.deleted_at is null
    -- A wallet with nothing on either side is a leftover row, not a depositor.
    where j.vault > 0 or j.periods > 0 or j.deposits > 0
    order by total desc, j.wallet
    limit ${limit} offset ${offset}
  `;

  const total = rows[0]?.total_count ?? 0;
  return {
    rows: rows.map(({ total_count: _ignored, ...row }) => row),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  };
}
