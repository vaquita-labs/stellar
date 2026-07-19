import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Server-side admin API for the `rewards` collection. Runs in the Next.js Node
// server (never the browser) and talks to the same Postgres DB as apps/api via
// the shared @vaquita/db Prisma client. Mirrors the tokens route's auth/runtime
// conventions: a collection with list/create/update/soft-delete.
export const runtime = 'nodejs';
// Rewards are read live from the DB — never statically cached.
export const dynamic = 'force-dynamic';

/**
 * Same contract as apps/api's requireAdminSecret: if ADMIN_SECRET is set, the
 * request must echo it in `x-admin-secret`. If unset, the endpoint is open
 * (dev only). Note this is a SERVER env var (not NEXT_PUBLIC_), so the secret
 * itself never ships to the browser.
 */
function adminSecretOk(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  return req.headers.get('x-admin-secret') === secret;
}

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

// Empty strings coming from the form are normalized to null (clears the column).
const nullableStr = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));

// Shared field validators. `key` is the stable identifier the rest of the app
// references (e.g. 'experience'); `name` is the human label.
const rewardFields = {
  key: nullableStr(100),
  name: nullableStr(100),
};

// On create both fields are optional; the schema mirrors the nullable columns.
const createSchema = z.object({
  key: rewardFields.key,
  name: rewardFields.name,
});

// On update everything is optional; only sent keys are written. `id` is a
// BigInt column, so accept a positive int from the client and widen to BigInt.
const updateSchema = z.object({
  id: z.number().int().positive(),
  key: rewardFields.key,
  name: rewardFields.name,
});

const invalidJson = () => NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });

// `id` is a `bigint` column, but the public contract is `number`. BigInt has no
// JSON representation, so we must map it to Number before handing the row to
// NextResponse.json. Reward ids are small, well within Number.MAX_SAFE_INTEGER.
type RewardRow = Awaited<ReturnType<typeof prisma.reward.findFirstOrThrow>>;
const serializeReward = (reward: RewardRow) => ({
  ...reward,
  id: Number(reward.id),
});

// GET /api/admin/rewards — list every non-deleted reward, ordered by id.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();
  const rewards = await prisma.reward.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
  });
  return NextResponse.json({ data: { rewards: rewards.map(serializeReward) } });
}

// POST /api/admin/rewards — create a new reward.
export async function POST(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', message: 'Invalid reward payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const reward = await prisma.reward.create({
    data: {
      key: d.key ?? null,
      name: d.name ?? '',
    },
  });
  return NextResponse.json({ data: { reward: serializeReward(reward) } });
}

// PATCH /api/admin/rewards — update an existing reward (id in the body).
export async function PATCH(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', message: 'Invalid reward payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { id, ...data } = parsed.data;
  const rewardId = BigInt(id);

  const existing = await prisma.reward.findFirst({ where: { id: rewardId, deletedAt: null } });
  if (!existing) {
    return NextResponse.json({ status: 'error', message: 'Reward not found' }, { status: 404 });
  }

  const reward = await prisma.reward.update({
    where: { id: rewardId },
    // Only write keys the client actually sent.
    data: {
      ...(data.key !== undefined ? { key: data.key } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
    },
  });
  return NextResponse.json({ data: { reward: serializeReward(reward) } });
}

// DELETE /api/admin/rewards?id=123 — soft-delete (sets deleted_at).
export async function DELETE(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const idParam = req.nextUrl.searchParams.get('id');
  const id = Number(idParam);
  if (!idParam || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ status: 'error', message: 'Valid id query param required' }, { status: 400 });
  }
  const rewardId = BigInt(id);

  const existing = await prisma.reward.findFirst({ where: { id: rewardId, deletedAt: null } });
  if (!existing) {
    return NextResponse.json({ status: 'error', message: 'Reward not found' }, { status: 404 });
  }

  await prisma.reward.update({ where: { id: rewardId }, data: { deletedAt: new Date() } });
  return NextResponse.json({ data: { id } });
}