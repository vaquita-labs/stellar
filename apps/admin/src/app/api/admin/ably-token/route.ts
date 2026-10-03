import { type NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '@/core-ui/config/serverEnv';
import { adminSecretOk } from '@/lib/adminSecret';

// GET /api/admin/ably-token — Ably token request for the admin dashboard.
// Proxies the API's admin-scoped endpoint server-side so ADMIN_SECRET stays on
// the server; the browser authenticates with its passcode session cookie.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await adminSecretOk(req))) {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
  }
  const env = getServerEnv();
  const response = await fetch(`${env.SERVICES_URL}/api/v1/ably/admin-token`, {
    headers: { 'x-admin-secret': env.ADMIN_SECRET },
    cache: 'no-store',
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
