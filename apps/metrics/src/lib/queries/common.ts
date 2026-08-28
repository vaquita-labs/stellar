import { prisma } from '@vaquita/db';
import { bucketStep, EPOCH, type Range } from '@/lib/range';

// Every metric is a read-only SQL query through the shared Prisma client.
// Counts are cast to ::int and sums to ::float8 in SQL so the rows are plain
// JSON (no BigInt/Decimal) and can be handed straight to client components.

export type SqlWindow = {
  bucket: string;
  step: string;
  since: Date;
  /** Start of the previous window of the same length (for deltas). */
  prevSince: Date;
  /** False for "all time": there is no previous period to compare against. */
  hasPrev: boolean;
};

/** Start of the data: the oldest profile or deposit, so "all time" charts do not begin with an empty year. */
async function firstRowAt(): Promise<Date> {
  const [row] = await prisma.$queryRaw<{ first: Date | null }[]>`
    select least((select min(created_at) from profiles), (select min(created_at) from deposits)) as first
  `;
  return row?.first ?? EPOCH;
}

export async function sqlWindow(range: Range): Promise<SqlWindow> {
  const since = range.since ?? (await firstRowAt());
  const len = Date.now() - since.getTime();
  return {
    bucket: range.bucket,
    step: bucketStep(range.bucket),
    since,
    prevSince: new Date(since.getTime() - len),
    hasPrev: range.since != null,
  };
}

/** Effective timestamp of a deposit/withdrawal row: on-chain confirmation, else creation. */
export const TS = 'coalesce(confirmed_at, created_at)';
