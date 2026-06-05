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

// Currencies and languages are both fiat/UI display options shown on the web
// app's Preferences page, stored on the singleton config row as Json arrays of
// `{ id, label, hint? }`.
type Currency = { id: string; label: string; hint?: string };
type Language = { id: string; label: string; hint?: string };

// The empty shape returned when no config row exists yet. `id` is null so the
// client can tell "nothing saved" apart from a real row (which always has an id).
const emptyConfig = {
  id: null,
  networkName: '',
  origins: [] as string[],
  networkPassphrase: null,
  badgesContractAddress: null,
  cycleDurationMs: null as number | null,
  dailyGoldCoins: 0,
  dailyCheckinExperience: 0,
  currencies: [] as Currency[],
  languages: [] as Language[],
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

// An option entry: short id (e.g. "usd" / "en"), display label ("USD" /
// "English") and optional hint ("US Dollar" / "United States"). Empty hints are
// normalized away so the column stays clean. Shared by currencies and languages.
const optionSchema = z.object({
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
  // Fixed leaderboard cycle duration in ms. null/blank clears it (production
  // monthly cycles). Always resolves to number|null so the full-payload save
  // writes it every time, like the nullableStr fields.
  cycleDurationMs: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((v) => (typeof v === 'number' && v > 0 ? v : null)),
  // Daily check-in reward amounts. Non-negative integers; only written when sent.
  dailyGoldCoins: z.number().int().min(0).optional(),
  dailyCheckinExperience: z.number().int().min(0).optional(),
  currencies: z.array(optionSchema).optional(),
  languages: z.array(optionSchema).optional(),
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
        cycleDurationMs: data.cycleDurationMs ?? null,
        dailyGoldCoins: data.dailyGoldCoins ?? 1,
        dailyCheckinExperience: data.dailyCheckinExperience ?? 0,
        currencies: data.currencies ?? [],
        languages: data.languages ?? [],
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
      ...(data.languages !== undefined ? { languages: data.languages } : {}),
      ...(data.dailyGoldCoins !== undefined ? { dailyGoldCoins: data.dailyGoldCoins } : {}),
      ...(data.dailyCheckinExperience !== undefined ? { dailyCheckinExperience: data.dailyCheckinExperience } : {}),
      networkPassphrase: data.networkPassphrase,
      badgesContractAddress: data.badgesContractAddress,
      cycleDurationMs: data.cycleDurationMs,
    },
  });
  return NextResponse.json({ data: { config } });
}
