import { listSupportConversations } from '@vaquita/shared/services/support/index';
import { type NextRequest, NextResponse } from 'next/server';
import { adminSecretOk } from '@/lib/adminSecret';

// Inbox of the private Help Center chat. Reads the same Postgres DB as apps/api
// through @vaquita/shared, like the feedback route. The screen polls it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

// GET /api/admin/support — every conversation, most recent activity first. The
// status filters and the search run on the client: the inbox is small, and the
// "Waiting on us" count has to be right whichever filter is open.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const conversations = await listSupportConversations({ limit: 200 });
  return NextResponse.json({ data: { conversations } });
}
