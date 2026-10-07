import { type NextRequest, NextResponse } from 'next/server';
import { adminRequestOk } from '@/lib/adminSecret';
import { getServerEnv } from '@/core-ui/config/serverEnv';

// GET /api/admin/ably-token — the admin realtime token, fetched server-side.
//
// The API's `/ably/admin-token` wants `x-admin-secret`, and the browser used to
// send it straight from a NEXT_PUBLIC_ variable. Now the browser asks this
// route with its session cookie, and the secret is added here. The response is
// the raw Ably TokenRequest, unwrapped, because the Ably client reads it from
// `authUrl` as-is.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await adminRequestOk(req))) {
    return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
  }

  const env = getServerEnv();
  const response = await fetch(`${env.SERVICES_URL}/api/v1/ably/admin-token`, {
    headers: { 'x-admin-secret': env.ADMIN_SECRET },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    return NextResponse.json(
      { status: 'error', message: data?.message ?? `Ably token request failed (${response.status})` },
      { status: response.ok ? 502 : response.status },
    );
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
