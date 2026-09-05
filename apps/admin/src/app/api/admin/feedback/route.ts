import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  type FeedbackPostWithAttachments,
  listFeedbackPosts,
  updateFeedbackPostStatus,
} from '@vaquita/shared';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSecretOk } from '@/lib/adminSecret';

// Triage inbox for the in-app "Report a bug" / "Send feedback" forms. Reads the
// same Postgres DB as apps/api through @vaquita/shared, so no admin auth has to
// be added to the public API — the same shape the notifications route uses.
export const runtime = 'nodejs';
// Reports arrive continuously; the inbox is never statically cached.
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });

const kindSchema = z.enum(FEEDBACK_KINDS);
const statusSchema = z.enum(FEEDBACK_STATUSES);

// Only the status moves from here. Title and details are what the user wrote:
// editing them would rewrite the report we are meant to be reading.
const updateSchema = z.object({
  id: z.string().uuid(),
  status: statusSchema,
});

/**
 * Unlike the DTO the public API returns, the admin list keeps `walletAddress`
 * and `userAgent`: identifying who hit the bug and on what browser is the whole
 * point of the triage screen, and this route is already behind ADMIN_SECRET.
 */
const serializePost = (post: FeedbackPostWithAttachments) => ({
  id: post.id,
  profileId: post.profileId,
  walletAddress: post.walletAddress,
  kind: post.kind,
  title: post.title,
  details: post.details,
  status: post.status,
  locale: post.locale,
  userAgent: post.userAgent,
  appPath: post.appPath,
  voteCount: post.voteCount,
  // Ids, not bytes: the screenshots are fetched one by one from the public API
  // endpoint that serves them, which is also what the in-app board hits.
  attachmentIds: post.attachments.map((a) => a.id),
  createdAt: post.createdAt.toISOString(),
  updatedAt: post.updatedAt.toISOString(),
});

// GET /api/admin/feedback?kind=bug&status=open — newest first. Both filters
// optional; anything unrecognized is ignored rather than rejected, so a stale
// bookmark still lists something instead of erroring.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const kind = kindSchema.safeParse(req.nextUrl.searchParams.get('kind'));
  const status = statusSchema.safeParse(req.nextUrl.searchParams.get('status'));

  const posts = await listFeedbackPosts({
    ...(kind.success ? { kind: kind.data } : {}),
    ...(status.success ? { status: status.data } : {}),
    limit: 200,
  });

  return NextResponse.json({ data: { posts: posts.map(serializePost) } });
}

// PATCH /api/admin/feedback — move one report along the lifecycle (id in body).
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
      { status: 'error', message: 'Invalid feedback payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const post = await updateFeedbackPostStatus(parsed.data.id, parsed.data.status);
  if (!post) {
    return NextResponse.json({ status: 'error', message: 'Report not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { post: serializePost(post) } });
}
