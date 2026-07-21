import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Server-side admin API for the `tokens` collection. Runs in the Next.js Node
// server (never the browser) and talks to the same Postgres DB as apps/api via
// the shared @vaquita/db Prisma client. Mirrors the project-config route's
// auth/runtime conventions but operates on a collection (list/create/update/
// soft-delete) instead of a singleton.
export const runtime = 'nodejs';
// Tokens are read live from the DB — never statically cached.
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

// Shared field validators. lockPeriods is a list of non-negative ints.
const tokenFields = {
  name: z.string().min(1).max(50),
  symbol: z.string().min(1).max(20),
  decimals: z.number().int().min(0).max(255).nullish(),
  isNative: z.boolean(),
  isGas: z.boolean(),
  isSupported: z.boolean(),
  contractAddress: nullableStr(128),
  vaquitaContractAddress: nullableStr(128),
  lockPeriods: z.array(z.number().int().min(0)),
  defindexVaultContractAddress: nullableStr(10_000),
};

// On create, name + symbol are required; everything else has a sensible default.
const createSchema = z.object({
  name: tokenFields.name,
  symbol: tokenFields.symbol,
  decimals: tokenFields.decimals,
  isNative: tokenFields.isNative.optional(),
  isGas: tokenFields.isGas.optional(),
  isSupported: tokenFields.isSupported.optional(),
  contractAddress: tokenFields.contractAddress,
  vaquitaContractAddress: tokenFields.vaquitaContractAddress,
  lockPeriods: tokenFields.lockPeriods.optional(),
  defindexVaultContractAddress: tokenFields.defindexVaultContractAddress,
});

// On update everything is optional; only sent keys are written.
const updateSchema = z.object({
  id: z.number().int().positive(),
  name: tokenFields.name.optional(),
  symbol: tokenFields.symbol.optional(),
  decimals: tokenFields.decimals,
  isNative: tokenFields.isNative.optional(),
  isGas: tokenFields.isGas.optional(),
  isSupported: tokenFields.isSupported.optional(),
  contractAddress: tokenFields.contractAddress,
  vaquitaContractAddress: tokenFields.vaquitaContractAddress,
  lockPeriods: tokenFields.lockPeriods.optional(),
  defindexVaultContractAddress: tokenFields.defindexVaultContractAddress,
});

const invalidJson = () => NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });

// `lock_periods` is a `bigint[]` column (durations in ms can exceed int32), but
// the public contract is `number[]`. BigInt has no JSON representation, so we
// must map it to Number before handing the row to NextResponse.json. The values
// are millisecond durations, well within Number.MAX_SAFE_INTEGER.
type TokenRow = Awaited<ReturnType<typeof prisma.token.findFirstOrThrow>>;
const serializeToken = (token: TokenRow) => ({
  ...token,
  lockPeriods: token.lockPeriods.map(Number),
});

// GET /api/admin/tokens — list every non-deleted token, ordered by id.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();
  const tokens = await prisma.token.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
  });
  return NextResponse.json({ data: { tokens: tokens.map(serializeToken) } });
}

// POST /api/admin/tokens — create a new token.
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
      { status: 'error', message: 'Invalid token payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const token = await prisma.token.create({
    data: {
      name: d.name,
      symbol: d.symbol,
      decimals: d.decimals ?? null,
      isNative: d.isNative ?? false,
      isGas: d.isGas ?? false,
      isSupported: d.isSupported ?? false,
      contractAddress: d.contractAddress ?? null,
      vaquitaContractAddress: d.vaquitaContractAddress ?? null,
      lockPeriods: (d.lockPeriods ?? []).map((n) => BigInt(n)),
      defindexVaultContractAddress: d.defindexVaultContractAddress ?? null,
    },
  });
  return NextResponse.json({ data: { token: serializeToken(token) } });
}

// PATCH /api/admin/tokens — update an existing token (id in the body).
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
      { status: 'error', message: 'Invalid token payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { id, ...data } = parsed.data;

  const existing = await prisma.token.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    return NextResponse.json({ status: 'error', message: 'Token not found' }, { status: 404 });
  }

  const token = await prisma.token.update({
    where: { id },
    // Only write keys the client actually sent.
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.symbol !== undefined ? { symbol: data.symbol } : {}),
      ...(data.decimals !== undefined ? { decimals: data.decimals } : {}),
      ...(data.isNative !== undefined ? { isNative: data.isNative } : {}),
      ...(data.isGas !== undefined ? { isGas: data.isGas } : {}),
      ...(data.isSupported !== undefined ? { isSupported: data.isSupported } : {}),
      ...(data.contractAddress !== undefined ? { contractAddress: data.contractAddress } : {}),
      ...(data.vaquitaContractAddress !== undefined ? { vaquitaContractAddress: data.vaquitaContractAddress } : {}),
      ...(data.lockPeriods !== undefined ? { lockPeriods: data.lockPeriods.map((n) => BigInt(n)) } : {}),
      ...(data.defindexVaultContractAddress !== undefined
        ? { defindexVaultContractAddress: data.defindexVaultContractAddress }
        : {}),
    },
  });
  return NextResponse.json({ data: { token: serializeToken(token) } });
}

// DELETE /api/admin/tokens?id=123 — soft-delete (sets deleted_at).
export async function DELETE(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const idParam = req.nextUrl.searchParams.get('id');
  const id = Number(idParam);
  if (!idParam || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ status: 'error', message: 'Valid id query param required' }, { status: 400 });
  }

  const existing = await prisma.token.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    return NextResponse.json({ status: 'error', message: 'Token not found' }, { status: 404 });
  }

  await prisma.token.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ data: { id } });
}
