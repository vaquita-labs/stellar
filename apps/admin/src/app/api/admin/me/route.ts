import { type NextRequest, NextResponse } from 'next/server';
import { adminRequest, forbidden } from '@/lib/adminSecret';

// GET /api/admin/me — who the current request is, for the UI: the email and
// role so write controls can hide for read-only people. The server check in
// each route is what enforces it; this only decides what to draw.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await adminRequest(req);
  if (!actor) return forbidden();
  return NextResponse.json({ data: { email: actor.email, role: actor.role, via: actor.via } });
}
