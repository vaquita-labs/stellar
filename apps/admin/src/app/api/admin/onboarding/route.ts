import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSecretOk } from '@/lib/adminSecret';
import { ONBOARDING_FLAGS, ONBOARDING_KEYS } from '@/core-ui/config/onboardings';

// Which first-run experiences each profile has completed, and the switch to
// re-open one. Reads and writes `profiles` through Prisma like the rest of the
// admin: the public API's flags endpoint is behind `requireWalletSession`, so it
// only ever lets a wallet write its OWN flags — an admin acting on someone else
// cannot go through it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const listSchema = z.object({
  // Matches nickname, wallet address or email. Empty means "everyone".
  q: z.string().trim().max(120).optional(),
  // Narrow to the profiles that have NOT completed one specific onboarding,
  // which is the question worth asking in bulk ("who never saw the tour?").
  pending: z.enum(ONBOARDING_KEYS).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

const updateSchema = z.object({
  walletAddress: z.string().trim().min(1),
  // The enum is what keeps this from being an arbitrary column write: `key`
  // goes straight into the Prisma update, so it must never be free-form.
  key: z.enum(ONBOARDING_KEYS),
  value: z.boolean(),
});

const flagSelect = Object.fromEntries(ONBOARDING_FLAGS.map((f) => [f.key, true]));

export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const parsed = listSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', message: parsed.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });
  }
  const { q, pending, limit, offset } = parsed.data;

  const where = {
    ...(q
      ? {
          OR: [
            { nickname: { contains: q, mode: 'insensitive' as const } },
            { walletAddress: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(pending ? { [pending]: false } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.profile.findMany({
      where,
      select: { id: true, nickname: true, walletAddress: true, email: true, createdAt: true, ...flagSelect },
      // Newest first: the profiles worth inspecting are usually the recent ones.
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.profile.count({ where }),
  ]);

  return NextResponse.json({
    status: 'success',
    data: {
      total,
      rows: rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        walletAddress: row.walletAddress,
        email: row.email,
        createdAt: row.createdAt?.toISOString() ?? null,
        flags: Object.fromEntries(ONBOARDING_FLAGS.map((f) => [f.key, (row as Record<string, unknown>)[f.key] === true])),
      })),
    },
  });
}

export async function PATCH(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', message: parsed.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });
  }
  const { walletAddress, key, value } = parsed.data;

  // `updateMany` rather than `update`: the wallet address is not the primary
  // key, and a miss should read as "no such profile" instead of throwing.
  const { count } = await prisma.profile.updateMany({ where: { walletAddress }, data: { [key]: value } });
  if (count === 0) {
    return NextResponse.json({ status: 'error', message: 'Profile not found' }, { status: 404 });
  }

  return NextResponse.json({ status: 'success', data: { walletAddress, key, value } });
}
