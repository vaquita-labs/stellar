import { getFeedbackAttachmentForReview } from '@vaquita/shared/services/feedback/index';
import { type NextRequest, NextResponse } from 'next/server';
import { adminRequestOk } from '@/lib/adminSecret';

// Screenshot bytes for the review screen.
//
// The public endpoint in apps/api now serves only approved reports, which is
// precisely the set a reviewer does NOT need to look at. This route reads the
// row with no visibility filter — the whole point is seeing the picture before
// deciding whether anyone else may.
//
// Behind `adminRequestOk` like the sibling routes: an <img src> cannot send a
// header, but it does send the session cookie, which the guard accepts.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminRequestOk(req))) return new NextResponse(null, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 404 });

  const file = await getFeedbackAttachmentForReview(id);
  if (!file) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.data.length),
      // Never cached, not even by the reviewer's own browser: this is the one
      // place unreviewed content is readable, and a rejected image should stop
      // being reachable the moment it is rejected.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
