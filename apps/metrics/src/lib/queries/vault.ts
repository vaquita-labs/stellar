import { Prisma, prisma } from '@vaquita/db';
import type { SqlWindow } from './common';

// TVL, read from the DeFindex vault the Vaquita pool forwards funds into.
//
// The deposits ledger can only say how much *principal* is currently locked:
// it does not know about accrued yield, and it cannot see the flexible balances
// supplied to the same vault. The vault knows the whole number. The API samples
// it into `vault_tvl_snapshots` (see the shared `sampleVaultTvl` service) and
// this module is the read side — still one SQL round-trip, still no Soroban
// call from the dashboard.

export type VaultTvlPoint = {
  bucket: string;
  /** Vault total at the END of the bucket, carried forward. Null before the first sample. */
  vault_tvl: number | null;
};

export type VaultTvl = {
  /** Latest sampled total across every sampled vault. */
  current: number;
  /** When that sample was taken — the series is only as fresh as the traffic that produced it. */
  fetchedAt: Date;
  series: VaultTvlPoint[];
};

/**
 * `vault_tvl_snapshots` does not exist on environments where the migration has
 * not been applied by hand, and a missing relation fails the whole statement at
 * parse time. Probe first; the pages fall back to the ledger-derived curve.
 */
export async function hasVaultTvlSnapshots(): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ present: boolean }[]>`
    select to_regclass('public.vault_tvl_snapshots') is not null as present
  `;
  return row?.present ?? false;
}

/**
 * The vault TVL curve over the window, or `null` when nothing has been sampled
 * yet (a fresh environment, or one whose API has not served a portfolio since
 * the migration landed).
 *
 * Each bucket takes the LAST sample at or before its end, not an average:
 * sampling follows traffic, so an average would weight busy hours and turn a
 * flat balance into a wobble. Buckets with no sample yet carry the previous
 * value forward, which is what actually happened to the vault — nothing.
 */
export async function vaultTvl(w: SqlWindow): Promise<VaultTvl | null> {
  const latest = await vaultTvlCurrent();
  if (!latest) return null;

  const series = await prisma.$queryRaw<VaultTvlPoint[]>`
    with buckets as (
      select generate_series(date_trunc(${w.bucket}, ${w.since}::timestamptz), date_trunc(${w.bucket}, now()), ${w.step}::interval) as b
    )
    select to_char(buckets.b, 'YYYY-MM-DD') as bucket, s.v as vault_tvl
    from buckets
    left join lateral (
      -- Sum the latest sample of each vault as of the end of this bucket. Null
      -- (not zero) when no vault had been sampled yet: an empty chart is honest,
      -- a line pinned at $0 is a claim the vault was empty.
      select sum(t.total_managed)::float8 as v
      from (
        select distinct on (network, vault_address) total_managed
        from vault_tvl_snapshots
        where fetched_at < buckets.b + ${w.step}::interval
        order by network, vault_address, fetched_at desc
      ) t
    ) s on true
    order by buckets.b
  `;

  return { current: latest.current, fetchedAt: latest.fetchedAt, series };
}

/** Latest sampled vault total only — for callers that need the number, not the curve. */
export async function vaultTvlCurrent(): Promise<{ current: number; fetchedAt: Date } | null> {
  if (!(await hasVaultTvlSnapshots())) return null;
  const [row] = await prisma.$queryRaw<{ current: number; fetched_at: Date }[]>`
    select coalesce(sum(t.total_managed), 0)::float8 as current,
           max(t.fetched_at) as fetched_at
    from (
      select distinct on (network, vault_address) total_managed, fetched_at
      from vault_tvl_snapshots
      order by network, vault_address, fetched_at desc
    ) t
  `;
  return row?.fetched_at ? { current: row.current, fetchedAt: row.fetched_at } : null;
}

/** "2 h ago" / "3 d ago" — how stale the vault reading on screen is. */
export function sampleAge(fetchedAt: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - fetchedAt.getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * `vault_flows` does not exist on environments where the migration has not been
 * applied by hand, and a missing relation fails the whole statement at parse
 * time — the same trap `hasVaultTvlSnapshots` exists for. Probe first.
 */
export async function hasVaultFlows(): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ present: boolean }[]>`
    select to_regclass('public.vault_flows') is not null as present
  `;
  return row?.present ?? false;
}

/**
 * The one definition of "a flexible deposit", as a relation the panels can join
 * against: `(wallet_address, amount, ts)`.
 *
 * Only `external_in` counts. The other three kinds move money between Vaquita's
 * own two products — flexible into a locked period, a locked period back into
 * flexible, the legacy Blend balance into the vault — and counting those as
 * deposits inflates volume by an amount the user never added, then congratulates
 * the cohort grid on the same money twice.
 *
 * When the table is missing the fragment is an empty relation of the right
 * shape, so a caller's `union all` and its casts still parse and the panel
 * degrades to locked-only rather than 500ing.
 */
export function vaultDepositEvents(present: boolean): Prisma.Sql {
  if (!present) {
    return Prisma.sql`(
      select null::varchar as wallet_address, null::float8 as amount, null::timestamptz as ts
      where false
    )`;
  }
  return Prisma.sql`(
    select wallet_address, amount::float8 as amount, confirmed_at as ts
    from vault_flows
    where deleted_at is null and flow_kind = 'external_in'
  )`;
}

/** The mirror of `vaultDepositEvents` for money leaving the flexible product. */
export function vaultWithdrawEvents(present: boolean): Prisma.Sql {
  if (!present) {
    return Prisma.sql`(
      select null::varchar as wallet_address, null::float8 as amount, null::timestamptz as ts
      where false
    )`;
  }
  return Prisma.sql`(
    select wallet_address, amount::float8 as amount, confirmed_at as ts
    from vault_flows
    where deleted_at is null and flow_kind = 'external_out'
  )`;
}
