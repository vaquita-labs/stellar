import {
  FEEDBACK_KINDS,
  FEEDBACK_MODERATION_DECISIONS,
  FEEDBACK_MODERATION_STATUSES,
  FEEDBACK_STATUSES,
  type FeedbackModerationStatus,
  type FeedbackPostWithAttachments,
  deleteFeedbackPost,
  listFeedbackPosts,
  setFeedbackModerationStatus,
  updateFeedbackPostStatus,
} from '@vaquita/shared/services/feedback/index';
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
const moderationStatusSchema = z.enum(FEEDBACK_MODERATION_STATUSES);
// An admin approves or rejects. 'pending' and 'flagged' are what the pipeline
// concluded, and letting a human write them back would be fabricating a verdict.
const moderationDecisionSchema = z.enum(FEEDBACK_MODERATION_DECISIONS);

// Only the status and the moderation decision move from here. Title and details
// are what the user wrote: editing them would rewrite the report we are meant to
// be reading.
const updateSchema = z
  .object({
    id: z.string().uuid(),
    status: statusSchema.optional(),
    moderationStatus: moderationDecisionSchema.optional(),
  })
  .refine((v) => v.status !== undefined || v.moderationStatus !== undefined, {
    message: 'Nothing to update',
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
  moderationStatus: post.moderationStatus,
  // The model's raw answer. The screen reads `categories` off it to say WHY
  // something was flagged; on a failed check it is `{ error }` instead, which is
  // equally the thing the reviewer needs to see.
  moderationResult: post.moderationResult,
  moderatedAt: post.moderatedAt?.toISOString() ?? null,
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

// GET /api/admin/feedback?kind=bug&status=open&moderationStatus=flagged — newest
// first. Every filter optional; anything unrecognized is ignored rather than
// rejected, so a stale bookmark still lists something instead of erroring.
//
// `moderationStatus=review` is the one alias: pending + flagged, which is the
// queue somebody actually has to work through and the screen's default view.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const kind = kindSchema.safeParse(req.nextUrl.searchParams.get('kind'));
  const status = statusSchema.safeParse(req.nextUrl.searchParams.get('status'));

  const moderationParam = req.nextUrl.searchParams.get('moderationStatus');
  const moderation = moderationStatusSchema.safeParse(moderationParam);
  const moderationFilter: FeedbackModerationStatus[] | undefined =
    moderationParam === 'review'
      ? ['pending', 'flagged']
      : moderation.success
        ? [moderation.data]
        : undefined;

  const posts = await listFeedbackPosts({
    ...(kind.success ? { kind: kind.data } : {}),
    ...(status.success ? { status: status.data } : {}),
    ...(moderationFilter ? { moderationStatus: moderationFilter } : {}),
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

  // Two independent axes on one row, so the two writes are sequential rather
  // than one update: in practice the screen only ever sends one of them.
  let post: FeedbackPostWithAttachments | null = null;
  if (parsed.data.status) {
    post = await updateFeedbackPostStatus(parsed.data.id, parsed.data.status);
  }
  if (parsed.data.moderationStatus) {
    post = await setFeedbackModerationStatus(parsed.data.id, parsed.data.moderationStatus);
  }

  if (!post) {
    return NextResponse.json({ status: 'error', message: 'Report not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { post: serializePost(post) } });
}

// DELETE /api/admin/feedback?id=<uuid> — removes the report, its screenshots and
// its votes for good.
//
// A hard delete, unlike the campaigns route above. Rejecting is the reversible
// action and keeps the audit trail; this one exists for content nobody should
// be able to pull back out of the table, and the FK cascades take the bytes with
// it. The screen puts it behind a confirm.
export async function DELETE(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ status: 'error', message: 'Valid id query param required' }, { status: 400 });
  }

  if (!(await deleteFeedbackPost(id))) {
    return NextResponse.json({ status: 'error', message: 'Report not found' }, { status: 404 });
  }
  return NextResponse.json({ data: { id } });
}
