import { Prisma, prisma } from '@vaquita/db';
import type { SqlWindow } from './common';

// How much money moved through Vaquita, and across which boundary.
//
// One number called "volume" would be a lie. A single dollar's journey is
// on-ramp → wallet → vault → wallet → bank: four recorded events for one dollar.
// Summing every event inflates the figure roughly fourfold.
//
// So every recorded movement is assigned to exactly ONE of three boundaries:
//
// | Boundary | What crossing it means        | In                       | Out                                     |
// |----------|-------------------------------|--------------------------|-----------------------------------------|
// | edge     | money enters or leaves Vaquita | bridge in                | off-ramp, bridge out, send to an outsider |
// | savings  | wallet ↔ vault or lock period  | deposits, vault in       | withdrawn principal, vault out           |
// | p2p      | one Vaquita user to another    | —                        | —                                        |
//
// Because no event appears under two boundaries, each is internally additive and
// `edge + savings + p2p` is a sound total of CROSSINGS — what a payment
// processor means by processed value. It is a flow measure, not a balance; a
// reader who takes it for a balance is wrong by a multiple, which is why the
// page says so in its header.
//
// This partition is also what dissolves the three double-count traps in the data:
// an off-ramp writes a `vault_flows` `external_out` AND an `offramp_withdrawals`
// row; the withdraw sheet writes two hops; a bridge-in is usually followed by a
// vault deposit. Each pair is one savings crossing plus one edge crossing —
// different boundaries, so neither is counted twice.
//
// `internal_in` / `internal_out` vault flows are the one genuine double count
// (flexible into locked is the same money twice) and are excluded throughout.
// That is the entire reason `flow_kind` exists.
//
// What is MISSING is as important as what is here, and the page states all of it:
//
//  - Argentine pesos have no table at all, on either ramp. Not backfillable.
//  - Bolivian on-ramp value is local currency with no USDC column and no stored
//    rate, so it is reported as a count plus fiat grouped by currency and is
//    absent from every USD figure here. See `onrampCorridors` in `ramps.ts`.
//  - Flexible-vault history starts 2026-09-10 and outbound sends start with the
//    deploy that added `wallet_transfers`. Soroban keeps about a week of events,
//    so neither is recoverable.
//  - Withdrawn value is the parent deposit's principal only:
//    `withdrawals.transfer_amount`, `.interest` and `.reward` are null on every
//    production row and nothing writes them, so yield leaving is invisible.
//  - Money paid straight into a wallet from outside counts only once it reaches
//    savings. That was a deliberate call — no chain poller, no reconciler job.

/**
 * Which of the hand-applied tables exist here.
 *
 * A missing relation fails the whole statement at PARSE time, not at read, so
 * every fragment below takes these flags rather than probing — the same shape
 * `rampSeries` uses.
 */
export type VolumeTables = {
  vaultFlows: boolean;
  walletTransfers: boolean;
  offramp: boolean;
  onramp: boolean;
  bridge: boolean;
};

export async function volumeTables(): Promise<VolumeTables> {
  const [row] = await prisma.$queryRaw<Record<keyof VolumeTables, boolean>[]>`
    select to_regclass('public.vault_flows') is not null as "vaultFlows",
           to_regclass('public.wallet_transfers') is not null as "walletTransfers",
           to_regclass('public.offramp_withdrawals') is not null as "offramp",
           to_regclass('public.onramp_purchases') is not null as "onramp",
           to_regclass('public.bridge_transfers') is not null as "bridge"
  `;
  return {
    vaultFlows: row?.vaultFlows ?? false,
    walletTransfers: row?.walletTransfers ?? false,
    offramp: row?.offramp ?? false,
    onramp: row?.onramp ?? false,
    bridge: row?.bridge ?? false,
  };
}

// Amount columns on the ramp and bridge tables are client-reported varchar, so a
// row can hold whatever a provider once put there. A plain ::numeric cast on a
// stray value fails the entire statement and blanks the page; these read a
// non-numeric entry as 0, so one malformed row cannot take the dashboard down.
// Copied deliberately from `ramps.ts` rather than shared, because the column
// names differ and a shared helper would have to take them as strings anyway.
const NUMERIC = (column: string) =>
  Prisma.raw(`(case when ${column} ~ '^-?[0-9]+(\\.[0-9]+)?$' then ${column}::numeric else 0 end)`);

/** `(wallet_address, amount, ts, boundary, kind, direction)` with no rows. */
const NO_EVENTS = Prisma.sql`
  select null::varchar as wallet_address, null::float8 as amount, null::timestamptz as ts,
         null::text as boundary, null::text as kind, null::text as direction
  where false
`;

/**
 * A bridge transfer that actually landed.
 *
 * Two vocabularies live in this column: `completed` from the retired CCTP worker
 * and the 1Click enum (`SUCCESS`, `PENDING_DEPOSIT`, …) from the current client.
 * Counting a `PENDING_DEPOSIT` row would report money that has not arrived.
 */
const BRIDGE_SETTLED = Prisma.sql`status in ('completed', 'SUCCESS')`;

/**
 * Every recorded money movement as one relation:
 * `(wallet_address, amount, ts, boundary, kind, direction)`.
 *
 * `direction` is `in` or `out` **at the edge**, `in` or `out` **of savings**, and
 * `internal` for peer-to-peer, which crosses no boundary of the app at all. So
 * the in-versus-out chart filters to one boundary rather than summing two
 * different meanings of "in".
 *
 * Amounts are human USDC units throughout. On-ramp is deliberately absent: its
 * value cannot be converted (see the header).
 *
 * It is a parenthesised subquery, so **every call site must alias it** —
 * `from ${volumeEvents(t)} e`. Postgres rejects an unaliased subquery in `from`
 * at parse time, which takes the whole page down. That bug already shipped here
 * once.
 */
export function volumeEvents(t: VolumeTables): Prisma.Sql {
  const blocks: Prisma.Sql[] = [
    // Savings in — a locked deposit. `confirmed_at` is null until the chain
    // confirms, so the effective timestamp falls back to creation.
    Prisma.sql`
      select wallet_address, amount::float8 as amount,
             coalesce(confirmed_at, created_at) as ts,
             'savings'::text as boundary, 'locked_deposit'::text as kind, 'in'::text as direction
      from deposits
      where deleted_at is null and status = 'confirmed'
    `,
    // Savings out — a locked withdrawal, valued at the PARENT's principal.
    // `withdrawals` carries no wallet and no usable amount of its own.
    Prisma.sql`
      select d.wallet_address, d.amount::float8 as amount,
             coalesce(wd.confirmed_at, wd.created_at) as ts,
             'savings'::text as boundary, 'locked_withdrawal'::text as kind, 'out'::text as direction
      from withdrawals wd
      join deposits d on d.id = wd.deposit_id and d.deleted_at is null
      where wd.deleted_at is null and wd.status = 'confirmed'
    `,
  ];

  if (t.vaultFlows) {
    blocks.push(Prisma.sql`
      select wallet_address, amount::float8 as amount, confirmed_at as ts,
             'savings'::text as boundary,
             (case when flow_kind = 'external_in' then 'vault_in' else 'vault_out' end)::text as kind,
             (case when flow_kind = 'external_in' then 'in' else 'out' end)::text as direction
      from vault_flows
      where deleted_at is null and flow_kind in ('external_in', 'external_out')
    `);
  }

  if (t.walletTransfers) {
    // The same send sheet does both, and the stored `destination_kind` is what
    // separates them — resolved server-side at insert, never re-derived, because
    // the question is who owned that address WHEN the payment happened.
    blocks.push(Prisma.sql`
      select wallet_address, amount::float8 as amount, confirmed_at as ts,
             (case when destination_kind = 'vaquita_user' then 'p2p' else 'edge' end)::text as boundary,
             (case when destination_kind = 'vaquita_user' then 'p2p_send' else 'external_send' end)::text as kind,
             (case when destination_kind = 'vaquita_user' then 'internal' else 'out' end)::text as direction
      from wallet_transfers
      where deleted_at is null
    `);
  }

  if (t.offramp) {
    // No `confirmed_at` on this table: a row is opened before the USDC moves and
    // `updated_at` is when it reached its status, which is what `offrampKpis`
    // already treats as the settle time.
    blocks.push(Prisma.sql`
      select wallet_address, ${NUMERIC('usdc_amount')}::float8 as amount, updated_at as ts,
             'edge'::text as boundary, 'offramp'::text as kind, 'out'::text as direction
      from offramp_withdrawals
      where deleted_at is null and status = 'settled'
    `);
  }

  if (t.bridge) {
    // `amount` is the human figure the user sent; `amount_out` is base units on
    // some rows and 0 on others, so it is never summed here. The wallet is
    // whichever side of the transfer is on Stellar.
    blocks.push(Prisma.sql`
      select destination_wallet as wallet_address, ${NUMERIC('amount')}::float8 as amount, updated_at as ts,
             'edge'::text as boundary, 'bridge_in'::text as kind, 'in'::text as direction
      from bridge_transfers
      where deleted_at is null and direction = 'evm_to_stellar' and ${BRIDGE_SETTLED}
    `);
    blocks.push(Prisma.sql`
      select source_wallet as wallet_address, ${NUMERIC('amount')}::float8 as amount, updated_at as ts,
             'edge'::text as boundary, 'bridge_out'::text as kind, 'out'::text as direction
      from bridge_transfers
      where deleted_at is null and direction = 'stellar_to_evm' and ${BRIDGE_SETTLED}
    `);
  }

  return Prisma.sql`(${Prisma.join(blocks, ' union all ')})`;
}

/**
 * What each wallet holds right now: `(wallet_address, vault, locked, scraped_at)`.
 *
 * Lifted out of `depositorsPage` so the Referrers panel and the Volume tab share
 * one definition of "held". Two things it keeps from there:
 *
 *  - the filter to supported tokens. Rows survive a token being retired, and a
 *    retired token can share a vault address with the live one, so an unfiltered
 *    sum double-counts. Production is clean of those rows today, which is
 *    exactly why the filter has to stay: nothing would show it breaking;
 *  - locked principal counts only deposits with no confirmed withdrawal, since a
 *    withdrawn period is no longer held.
 *
 * `vault` comes from a SNAPSHOT (`refreshWalletBalances` writes it, every 6 h),
 * never a live read, so `scraped_at` travels with it and belongs on screen
 * beside the number. Alias every call site, as with `volumeEvents`.
 */
export function heldBalances(): Prisma.Sql {
  return Prisma.sql`(
    select coalesce(v.wallet_address, d.wallet_address) as wallet_address,
           coalesce(v.vault, 0)::float8 as vault,
           coalesce(d.locked, 0)::float8 as locked,
           v.scraped_at
    from (
      select wb.wallet_address, sum(wb.vault_usdc)::float8 as vault, max(wb.scraped_at) as scraped_at
      from wallet_balances wb
      where wb.token_id in (select id from tokens where is_supported = true and deleted_at is null)
      group by wb.wallet_address
    ) v
    full outer join (
      select d.wallet_address,
             coalesce(sum(d.amount) filter (
               where not exists (
                 select 1 from withdrawals wd
                 where wd.deposit_id = d.id and wd.deleted_at is null and wd.status = 'confirmed'
               )
             ), 0)::float8 as locked
      from deposits d
      where d.deleted_at is null and d.status = 'confirmed'
      group by d.wallet_address
    ) d on d.wallet_address = v.wallet_address
  )`;
}

export type VolumeKpis = {
  gross: number;
  gross_prev: number;
  gross_all: number;
  edge_in: number;
  edge_in_prev: number;
  edge_out: number;
  edge_out_prev: number;
  savings_in: number;
  savings_in_prev: number;
  savings_out: number;
  savings_out_prev: number;
  p2p: number;
  p2p_prev: number;
  wallets: number;
  wallets_prev: number;
};

export async function volumeKpis(w: SqlWindow, t: VolumeTables): Promise<VolumeKpis> {
  const [row] = await prisma.$queryRaw<VolumeKpis[]>`
    with e as (select * from ${volumeEvents(t)} ev where ev.ts is not null),
    cur as (select * from e where ts >= ${w.since}),
    prv as (select * from e where ts >= ${w.prevSince} and ts < ${w.since})
    select
      coalesce((select sum(amount) from cur), 0)::float8 as gross,
      coalesce((select sum(amount) from prv), 0)::float8 as gross_prev,
      coalesce((select sum(amount) from e), 0)::float8 as gross_all,
      coalesce((select sum(amount) from cur where boundary = 'edge' and direction = 'in'), 0)::float8 as edge_in,
      coalesce((select sum(amount) from prv where boundary = 'edge' and direction = 'in'), 0)::float8 as edge_in_prev,
      coalesce((select sum(amount) from cur where boundary = 'edge' and direction = 'out'), 0)::float8 as edge_out,
      coalesce((select sum(amount) from prv where boundary = 'edge' and direction = 'out'), 0)::float8 as edge_out_prev,
      coalesce((select sum(amount) from cur where boundary = 'savings' and direction = 'in'), 0)::float8 as savings_in,
      coalesce((select sum(amount) from prv where boundary = 'savings' and direction = 'in'), 0)::float8 as savings_in_prev,
      coalesce((select sum(amount) from cur where boundary = 'savings' and direction = 'out'), 0)::float8 as savings_out,
      coalesce((select sum(amount) from prv where boundary = 'savings' and direction = 'out'), 0)::float8 as savings_out_prev,
      coalesce((select sum(amount) from cur where boundary = 'p2p'), 0)::float8 as p2p,
      coalesce((select sum(amount) from prv where boundary = 'p2p'), 0)::float8 as p2p_prev,
      (select count(distinct wallet_address) from cur)::int as wallets,
      (select count(distinct wallet_address) from prv)::int as wallets_prev
  `;
  return row;
}

export type VolumeSeriesRow = { bucket: string; edge: number; savings: number; p2p: number };

/** Gross volume per bucket, split by boundary — the three stack cleanly. */
export async function volumeSeries(w: SqlWindow, t: VolumeTables): Promise<VolumeSeriesRow[]> {
  return prisma.$queryRaw<VolumeSeriesRow[]>`
    with b as (
      select date_trunc(${w.bucket}, g) as b
      from generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as g
    ),
    e as (
      select date_trunc(${w.bucket}, ev.ts) as b, ev.boundary, sum(ev.amount)::float8 as amount
      from ${volumeEvents(t)} ev
      where ev.ts >= ${w.since}
      group by 1, 2
    )
    select to_char(b.b, 'YYYY-MM-DD') as bucket,
           coalesce(sum(e.amount) filter (where e.boundary = 'edge'), 0)::float8 as edge,
           coalesce(sum(e.amount) filter (where e.boundary = 'savings'), 0)::float8 as savings,
           coalesce(sum(e.amount) filter (where e.boundary = 'p2p'), 0)::float8 as p2p
    from b left join e on e.b = b.b
    group by b.b
    order by b.b
  `;
}

export type EdgeFlowRow = { bucket: string; inbound: number; outbound: number };

/**
 * Money arriving versus money leaving, **at the edge only**.
 *
 * Mixing this with savings would add two different meanings of "in" — entering
 * the app and entering the vault — and produce a number that answers neither
 * question.
 */
export async function edgeFlowSeries(w: SqlWindow, t: VolumeTables): Promise<EdgeFlowRow[]> {
  return prisma.$queryRaw<EdgeFlowRow[]>`
    with b as (
      select date_trunc(${w.bucket}, g) as b
      from generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as g
    ),
    e as (
      select date_trunc(${w.bucket}, ev.ts) as b, ev.direction, sum(ev.amount)::float8 as amount
      from ${volumeEvents(t)} ev
      where ev.ts >= ${w.since} and ev.boundary = 'edge'
      group by 1, 2
    )
    select to_char(b.b, 'YYYY-MM-DD') as bucket,
           coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)::float8 as inbound,
           coalesce(sum(e.amount) filter (where e.direction = 'out'), 0)::float8 as outbound
    from b left join e on e.b = b.b
    group by b.b
    order by b.b
  `;
}

export type VolumeKindRow = { kind: string; movements: number; amount: number };

/** One row per movement type, so an unexpectedly large block is visible. */
export async function volumeByKind(w: SqlWindow, t: VolumeTables): Promise<VolumeKindRow[]> {
  return prisma.$queryRaw<VolumeKindRow[]>`
    select ev.kind, count(*)::int as movements, coalesce(sum(ev.amount), 0)::float8 as amount
    from ${volumeEvents(t)} ev
    where ev.ts >= ${w.since}
    group by 1
    order by amount desc
  `;
}

export type VolumeUserRow = {
  wallet: string;
  nickname: string | null;
  gross: number;
  edge_in: number;
  edge_out: number;
  savings_in: number;
  savings_out: number;
  p2p: number;
  movements: number;
  last_move: Date;
};

export type VolumeUsersPage = {
  rows: VolumeUserRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/**
 * What each user has moved, **lifetime** — which is what "so far" means, and why
 * this one table ignores the range picker.
 */
export async function volumeByUser(
  t: VolumeTables,
  { limit, offset }: { limit: number; offset: number },
): Promise<VolumeUsersPage> {
  const rows = await prisma.$queryRaw<(VolumeUserRow & { total_count: number })[]>`
    with e as (
      select ev.wallet_address as wallet,
             coalesce(sum(ev.amount), 0)::float8 as gross,
             coalesce(sum(ev.amount) filter (where ev.boundary = 'edge' and ev.direction = 'in'), 0)::float8 as edge_in,
             coalesce(sum(ev.amount) filter (where ev.boundary = 'edge' and ev.direction = 'out'), 0)::float8 as edge_out,
             coalesce(sum(ev.amount) filter (where ev.boundary = 'savings' and ev.direction = 'in'), 0)::float8 as savings_in,
             coalesce(sum(ev.amount) filter (where ev.boundary = 'savings' and ev.direction = 'out'), 0)::float8 as savings_out,
             coalesce(sum(ev.amount) filter (where ev.boundary = 'p2p'), 0)::float8 as p2p,
             count(*)::int as movements,
             max(ev.ts) as last_move
      from ${volumeEvents(t)} ev
      where ev.wallet_address is not null
      group by 1
    )
    select e.wallet, p.nickname, e.gross, e.edge_in, e.edge_out,
           e.savings_in, e.savings_out, e.p2p, e.movements, e.last_move,
           count(*) over ()::int as total_count
    from e
    left join profiles p on p.wallet_address = e.wallet and p.deleted_at is null
    where e.gross > 0
    order by e.gross desc, e.wallet
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
