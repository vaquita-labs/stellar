import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSecretOk } from '@/lib/adminSecret';

// Server-side admin API for the `map_objects` catalog (placeable map elements).
// Runs in the Next.js Node server and talks to Postgres via the shared
// @vaquita/db Prisma client, mirroring the rewards route's conventions.
//
// The table stores each row's variants as three positionally-aligned CSV
// columns (`variants`, `prices`, `free_items`); the wire contract instead uses
// a structured `variants: [{ variant, price, freeItems }]` array so the
// alignment invariant is enforced here and never left to the client.
export const runtime = 'nodejs';
// The catalog is read live from the DB — never statically cached.
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

const invalidJson = () => NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });

// Mirror of MapObjectType (apps/web/src/core-ui/types/commons.ts) minus
// `empty`, which is the null tile and must never be a catalog row.
const MAP_OBJECT_TYPES = [
  'grass',
  'water',
  'bush',
  'rock',
  'tree',
  'road',
  'bank',
  'barn',
  'windmill',
  'well',
  'lamp',
  'leaderboard',
  'summit',
  'clock',
] as const;

const variantRowSchema = z.object({
  variant: z.number().int().min(0).max(100),
  price: z.number().min(0),
  freeItems: z.number().int().min(0),
});

const variantsSchema = z
  .array(variantRowSchema)
  .min(1)
  .max(20)
  .refine((rows) => new Set(rows.map((r) => r.variant)).size === rows.length, {
    message: 'Variant numbers must be unique within a row',
  });

// CSV triple like "0,0,0". The column is currently unread by any service but
// kept editable to stay faithful to the table.
const sizeSchema = z.string().regex(/^\d+(?:\.\d+)?,\d+(?:\.\d+)?,\d+(?:\.\d+)?$/, 'size must be a "x,y,z" CSV triple');

const createSchema = z.object({
  type: z.enum(MAP_OBJECT_TYPES),
  size: sizeSchema.optional(),
  variants: variantsSchema,
});

// On update everything is optional; only sent keys are written. `id` is a
// BigInt column, so accept a positive int from the client and widen to BigInt.
const updateSchema = z.object({
  id: z.number().int().positive(),
  type: z.enum(MAP_OBJECT_TYPES).optional(),
  size: sizeSchema.optional(),
  variants: variantsSchema.optional(),
});

// Structured variants -> the three positionally-aligned CSV columns.
const variantsToColumns = (rows: z.infer<typeof variantsSchema>) => ({
  variants: rows.map((r) => r.variant).join(','),
  prices: rows.map((r) => r.price).join(','),
  freeItems: rows.map((r) => r.freeItems).join(','),
});

// `id` is a `bigint` column, but the public contract is `number`. BigInt has
// no JSON representation, so map it to Number before NextResponse.json. The
// CSV columns are zipped back into the structured shape the client consumes.
type MapObjectRow = Awaited<ReturnType<typeof prisma.mapObject.findFirstOrThrow>>;
const serializeMapObject = (row: MapObjectRow) => {
  const variants = (row.variants ?? '').split(',').filter((v) => v.trim() !== '');
  const prices = (row.prices ?? '').split(',');
  const freeItems = (row.freeItems ?? '').split(',');
  return {
    id: Number(row.id),
    type: row.type ?? '',
    size: row.size ?? '0,0,0',
    variants: variants.map((variant, i) => ({
      variant: Number(variant),
      price: Number(prices[i]) || 0,
      freeItems: Number(freeItems[i]) || 0,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

// The user-facing catalog merge (getMapObjectsAvailableData) zips every
// non-deleted row, so two active rows of the same type would duplicate its
// variants. Enforce one active row per type.
const activeTypeExists = async (type: string, excludeId?: bigint) => {
  const existing = await prisma.mapObject.findFirst({
    where: { type, deletedAt: null, ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
  });
  return !!existing;
};

// GET /api/admin/map-objects — list every non-deleted catalog row, ordered by id.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();
  const mapObjects = await prisma.mapObject.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
  });
  return NextResponse.json({ data: { mapObjects: mapObjects.map(serializeMapObject) } });
}

// POST /api/admin/map-objects — create a new catalog row.
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
      { status: 'error', message: 'Invalid map object payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  if (await activeTypeExists(d.type)) {
    return NextResponse.json(
      { status: 'error', message: `An active catalog row for type "${d.type}" already exists` },
      { status: 409 }
    );
  }

  const mapObject = await prisma.mapObject.create({
    data: {
      type: d.type,
      size: d.size ?? '0,0,0',
      ...variantsToColumns(d.variants),
    },
  });
  return NextResponse.json({ data: { mapObject: serializeMapObject(mapObject) } });
}

// PATCH /api/admin/map-objects — update an existing catalog row (id in the body).
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
      { status: 'error', message: 'Invalid map object payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { id, ...data } = parsed.data;
  const mapObjectId = BigInt(id);

  const existing = await prisma.mapObject.findFirst({ where: { id: mapObjectId, deletedAt: null } });
  if (!existing) {
    return NextResponse.json({ status: 'error', message: 'Map object not found' }, { status: 404 });
  }

  if (data.type !== undefined && data.type !== existing.type && (await activeTypeExists(data.type, mapObjectId))) {
    return NextResponse.json(
      { status: 'error', message: `An active catalog row for type "${data.type}" already exists` },
      { status: 409 }
    );
  }

  const mapObject = await prisma.mapObject.update({
    where: { id: mapObjectId },
    // Only write keys the client actually sent.
    data: {
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.size !== undefined ? { size: data.size } : {}),
      ...(data.variants !== undefined ? variantsToColumns(data.variants) : {}),
    },
  });
  return NextResponse.json({ data: { mapObject: serializeMapObject(mapObject) } });
}

// DELETE /api/admin/map-objects?id=123 — soft-delete (sets deleted_at), which
// removes the row from the user-facing catalog.
export async function DELETE(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const idParam = req.nextUrl.searchParams.get('id');
  const id = Number(idParam);
  if (!idParam || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ status: 'error', message: 'Valid id query param required' }, { status: 400 });
  }
  const mapObjectId = BigInt(id);

  const existing = await prisma.mapObject.findFirst({ where: { id: mapObjectId, deletedAt: null } });
  if (!existing) {
    return NextResponse.json({ status: 'error', message: 'Map object not found' }, { status: 404 });
  }

  await prisma.mapObject.update({ where: { id: mapObjectId }, data: { deletedAt: new Date() } });
  return NextResponse.json({ data: { id } });
}
