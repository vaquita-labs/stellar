import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSecretOk } from '@/lib/adminSecret';
import { getServerEnv } from '@/core-ui/config/serverEnv';

// Admin API for notification campaigns.
//
// GET reads the history straight from Postgres (@vaquita/db, like the other
// admin routes). POST does NOT import the send logic: it proxies to the API
// service (`/api/v1/notifications/admin/send`) because the in-app half of a
// campaign (`notify()`) needs the API-only env (Ably realtime, etc.) —
// importing @vaquita/shared services here would kill this Next process on its
// env validation.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

const sendSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  // Sólo rutas internas: el SW abre el link dentro de la app.
  link: z
    .string()
    .trim()
    .regex(/^\/[^\s]*$/, 'link must be an internal route like /home')
    .max(300)
    .nullish()
    .transform((v) => v || null),
  audience: z.enum(['all', 'usernames']),
  usernames: z.array(z.string().trim().toLowerCase()).max(500).optional(),
});

// GET /api/admin/notifications — historial de campañas (últimas 50).
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();
  const campaigns = await prisma.pushCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ data: { campaigns } });
}

// POST /api/admin/notifications — proxea el envío al servicio API.
export async function POST(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', message: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 }
    );
  }

  const env = getServerEnv();
  const response = await fetch(`${env.SERVICES_URL}/api/v1/notifications/admin/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Server-to-server: el ADMIN_SECRET compartido con apps/api.
      'x-admin-secret': env.ADMIN_SECRET,
    },
    body: JSON.stringify(parsed.data),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { status: 'error', message: data?.message ?? `API send failed (${response.status})` },
      { status: response.status }
    );
  }
  return NextResponse.json({ data: data?.data ?? data });
}
