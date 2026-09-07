import { getReleaseNoteImageForReview } from '@vaquita/shared/services/releaseNotes/index';
import { type NextRequest, NextResponse } from 'next/server';

// Carousel bytes for the release-notes editor.
//
// The public endpoint in apps/api only serves images belonging to a PUBLISHED
// note, which is exactly the set an admin drafting one cannot see yet. This
// route reads the row with no visibility filter so the editor can preview a
// draft before it goes live.
//
// Like the feedback thumbnails, it is behind the passcode middleware rather
// than `adminSecretOk`: an <img src> cannot send a header, but the session
// cookie rides along.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 404 });

  const file = await getReleaseNoteImageForReview(id);
  if (!file) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.data.length),
      // A draft's pictures change between saves, so a cached copy would show
      // the previous upload right after replacing the carousel.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
