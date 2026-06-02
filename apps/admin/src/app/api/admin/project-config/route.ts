import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Server-side admin API for the singleton `project_config` row. Runs in the
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

// Accept camelCase from the client; map to Prisma's camelCase model fields.
// Empty strings coming from the form are normalized to null (clears the column).
const nullableStr = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  layer: nullableStr(20),
  type: nullableStr(100),
  smartContractEnv: nullableStr(50),
  origins: z.array(z.string().trim().min(1)).optional(),
  networkPassphrase: nullableStr(10_000),
  badgesContractAddress: nullableStr(10_000),
});

// GET /api/admin/project-config — read the singleton config (or null).
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();
  const config = await prisma.projectConfig.findFirst({ orderBy: { id: 'asc' } });
  return NextResponse.json({ data: { config } });
}

// PATCH /api/admin/project-config — upsert the singleton. Creates the row if it
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
      { status: 'error', message: 'Invalid project config payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const existing = await prisma.projectConfig.findFirst({ orderBy: { id: 'asc' } });

  if (!existing) {
    if (!data.name) {
      return NextResponse.json(
        { status: 'error', message: 'name is required to create the project config' },
        { status: 400 },
      );
    }
    const config = await prisma.projectConfig.create({
      data: {
        name: data.name,
        layer: data.layer ?? null,
        type: data.type ?? null,
        smartContractEnv: data.smartContractEnv ?? null,
        origins: data.origins ?? [],
        networkPassphrase: data.networkPassphrase ?? null,
        badgesContractAddress: data.badgesContractAddress ?? null,
      },
    });
    return NextResponse.json({ data: { config } });
  }

  const config = await prisma.projectConfig.update({
    where: { id: existing.id },
    // Only write keys the client actually sent.
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.layer !== undefined ? { layer: data.layer } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.smartContractEnv !== undefined ? { smartContractEnv: data.smartContractEnv } : {}),
      ...(data.origins !== undefined ? { origins: data.origins } : {}),
      ...(data.networkPassphrase !== undefined ? { networkPassphrase: data.networkPassphrase } : {}),
      ...(data.badgesContractAddress !== undefined
        ? { badgesContractAddress: data.badgesContractAddress }
        : {}),
    },
  });
  return NextResponse.json({ data: { config } });
}
