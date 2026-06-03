import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Server-side admin API for the singleton `config` row. Runs in the
// Next.js Node server (never the browser) and talks to the same Postgres DB as
// apps/api via the shared @vaquita/db Prisma client.
export const runtime = 'nodejs';
// The config is read live from the DB — never statically cached.
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

// The empty shape returned when no config row exists yet. `id` is null so the
// client can tell "nothing saved" apart from a real row (which always has an id).
// A fiat display currency offered in the web UI's Preferences page. Stored on
// the singleton config row as a Json array of `{ id, label, hint? }`.
type Currency = { id: string; label: string; hint?: string };

const emptyConfig = {
  id: null,
  networkName: '',
  origins: [] as string[],
  networkPassphrase: null,
  badgesContractAddress: null,
  currencies: [] as Currency[],
  createdAt: null,
  updatedAt: null,
};

// Accept camelCase from the client; map to Prisma's camelCase model fields.
// Empty strings coming from the form are normalized to null (clears the column).
const nullableStr = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));

// A currency entry: short id (e.g. "usd"), display label ("USD") and optional
// hint ("US Dollar"). Empty hints are normalized away so the column stays clean.
const currencySchema = z.object({
  id: z.string().trim().min(1).max(20),
  label: z.string().trim().min(1).max(50),
  hint: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

const updateSchema = z.object({
  networkName: z.string().min(1).max(50).optional(),
  origins: z.array(z.string().trim().min(1)).optional(),
  networkPassphrase: nullableStr(10_000),
  badgesContractAddress: nullableStr(10_000),
  currencies: z.array(currencySchema).optional(),
});

// GET /api/config — read the singleton config. Returns the empty-values shape
// (id: null) when the `config` table has no row yet, never null.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();
  const config = await prisma.config.findFirst({ orderBy: { id: 'asc' } });
  return NextResponse.json({ data: { config: config ?? emptyConfig } });
}

// PATCH /api/config — upsert the singleton. Creates the row if it
// doesn't exist yet (the table starts empty), otherwise updates the existing one.
export async function PATCH(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', message: 'Invalid config payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const existing = await prisma.config.findFirst({ orderBy: { id: 'asc' } });

  if (!existing) {
    if (!data.networkName) {
      return NextResponse.json(
        { status: 'error', message: 'networkName is required to create the config' },
        { status: 400 },
      );
    }
    const config = await prisma.config.create({
      data: {
        networkName: data.networkName,
        origins: data.origins ?? [],
        networkPassphrase: data.networkPassphrase ?? null,
        badgesContractAddress: data.badgesContractAddress ?? null,
        currencies: data.currencies ?? [],
      },
    });
    return NextResponse.json({ data: { config } });
  }

  const config = await prisma.config.update({
    where: { id: existing.id },
    // networkName / origins are truly optional (only written when sent). The two
    // nullableStr fields always resolve to string|null (never undefined), so the
    // form's full-payload saves write them every time — clearing on blank input.
    data: {
      ...(data.networkName !== undefined ? { networkName: data.networkName } : {}),
      ...(data.origins !== undefined ? { origins: data.origins } : {}),
      ...(data.currencies !== undefined ? { currencies: data.currencies } : {}),
      networkPassphrase: data.networkPassphrase,
      badgesContractAddress: data.badgesContractAddress,
    },
  });
  return NextResponse.json({ data: { config } });
}
