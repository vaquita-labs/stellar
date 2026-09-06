import { prisma } from '@vaquita/db';
import type { FeedbackPost } from '@vaquita/db';
import type { FeedbackPostResponseDTO } from '../../types';

/**
 * Bug reports and feedback sent from inside the app (Concierge → "Report a bug"
 * / "Send feedback").
 *
 * The two kinds share one table because they share one shape — a short title
 * and a details body. What differs is who reads them and what they do next, and
 * that is `kind` plus a filter, not a second table.
 *
 * SECURITY: the profile always comes from the session token. `walletAddress` is
 * stored denormalized so the report survives the deletion of the profile that
 * filed it (the same reasoning as `legalAcceptances`), but it is never read
 * from the request body.
 */

export const FEEDBACK_KINDS = ['bug', 'feedback'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_STATUSES = ['open', 'planned', 'in_progress', 'done', 'closed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * The content-moderation verdict, kept apart from `status` above.
 *
 * `status` is the triage lifecycle and is already doubling as a visibility flag
 * (`!= 'closed'` on the board). Folding the verdict into it would make "held
 * for review" and "won't fix" the same state, and an admin closing a duplicate
 * would be indistinguishable from an admin taking down abuse.
 *
 * Only `approved` is public:
 * - `pending`  — no verdict yet. The fail-closed default: no API key, a 429, a
 *                timeout. Waits for a human.
 * - `approved` — checked and clean, or an admin said so.
 * - `flagged`  — the model flagged it. Waits for a human, who can approve it.
 * - `rejected` — an admin pulled it down. Kept, so the decision has a record.
 */
export const FEEDBACK_MODERATION_STATUSES = ['pending', 'approved', 'flagged', 'rejected'] as const;
export type FeedbackModerationStatus = (typeof FEEDBACK_MODERATION_STATUSES)[number];

/** What an admin is allowed to set by hand. They review; they don't author verdicts. */
export const FEEDBACK_MODERATION_DECISIONS = ['approved', 'rejected'] as const;
export type FeedbackModerationDecision = (typeof FEEDBACK_MODERATION_DECISIONS)[number];

export const TITLE_MAX = 120;
export const DETAILS_MAX = 2000;

/**
 * How many reports one profile may file per hour. Not a security boundary — a
 * guard against a stuck submit button or a bored user filling the inbox. High
 * enough that nobody reporting real bugs in a bad session ever meets it.
 */
export const FEEDBACK_HOURLY_LIMIT = 10;

export const isFeedbackKind = (value: unknown): value is FeedbackKind =>
  typeof value === 'string' && (FEEDBACK_KINDS as readonly string[]).includes(value);

export const isFeedbackStatus = (value: unknown): value is FeedbackStatus =>
  typeof value === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(value);

export const isFeedbackModerationStatus = (value: unknown): value is FeedbackModerationStatus =>
  typeof value === 'string' && (FEEDBACK_MODERATION_STATUSES as readonly string[]).includes(value);

export const isFeedbackModerationDecision = (value: unknown): value is FeedbackModerationDecision =>
  typeof value === 'string' && (FEEDBACK_MODERATION_DECISIONS as readonly string[]).includes(value);

export const toFeedbackPostResponseDTO = (row: FeedbackPost): FeedbackPostResponseDTO => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  details: row.details,
  status: row.status,
  moderationStatus: row.moderationStatus,
  locale: row.locale,
  appPath: row.appPath,
  createdTimestamp: row.createdAt.getTime(),
  updatedTimestamp: row.updatedAt.getTime(),
});

/** Reports this profile filed in the last hour — the input to the abuse guard. */
export const countRecentFeedbackPosts = async (profileId: number): Promise<number> =>
  prisma.feedbackPost.count({
    where: {
      profileId,
      // No `deletedAt` filter on purpose. A run of spam that an admin has just
      // deleted is exactly the history this limit exists to remember; excluding
      // it would hand the spammer a fresh allowance for every takedown.
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

export const createFeedbackPost = async ({
  profileId,
  walletAddress,
  kind,
  title,
  details,
  locale,
  userAgent,
  appPath,
  attachments,
  moderationStatus,
  moderationResult,
}: {
  profileId: number | null;
  walletAddress: string;
  kind: FeedbackKind;
  title: string;
  details: string;
  locale?: string | null;
  userAgent?: string | null;
  appPath?: string | null;
  /** Screenshots, already decoded and type-checked by `decodeAttachment`. */
  attachments?: FeedbackAttachmentInput[];
  /**
   * The verdict for this report. Required, not defaulted: this is the only
   * place a `feedback_posts` row is ever created, so making the caller say it
   * out loud is what stops a future code path from quietly bypassing the gate.
   */
  moderationStatus: FeedbackModerationStatus;
  /** The model's answer, or `{ error }` when there wasn't one. Read by the admin. */
  moderationResult?: unknown;
}): Promise<FeedbackPost> =>
  // A nested create so a report and its screenshots land in one transaction:
  // a row that claims an attachment nobody can open is worse than no attachment.
  prisma.feedbackPost.create({
    data: {
      profileId,
      walletAddress,
      kind,
      title,
      details,
      locale: locale ?? null,
      userAgent: userAgent ?? null,
      appPath: appPath ?? null,
      moderationStatus,
      moderationResult: (moderationResult ?? null) as never,
      moderatedAt: new Date(),
      ...(attachments && attachments.length > 0
        ? {
            attachments: {
              create: attachments.map((a) => ({
                contentType: a.contentType,
                byteSize: a.data.length,
                data: a.data,
              })),
            },
          }
        : {}),
    },
  });

/**
 * The admin inbox. Both filters are optional so the default view is "everything,
 * newest first"; `limit` is capped by the caller.
 */
export type FeedbackPostWithAttachments = FeedbackPost & { attachments: { id: string }[] };

export const listFeedbackPosts = async ({
  kind,
  status,
  moderationStatus,
  limit = 100,
}: {
  kind?: FeedbackKind;
  status?: FeedbackStatus;
  /** One verdict, or several — the review queue is `pending` plus `flagged`. */
  moderationStatus?: FeedbackModerationStatus | FeedbackModerationStatus[];
  limit?: number;
} = {}): Promise<FeedbackPostWithAttachments[]> =>
  prisma.feedbackPost.findMany({
    where: {
      deletedAt: null,
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(moderationStatus
        ? { moderationStatus: Array.isArray(moderationStatus) ? { in: moderationStatus } : moderationStatus }
        : {}),
    },
    // Ids only: the bytes are served by the API one image at a time, and pulling
    // 200 reports' worth of screenshots through this list would be several
    // hundred MB of Postgres round-trip for a page that shows thumbnails.
    include: { attachments: { select: { id: true }, orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });

/** Moves a report along the triage lifecycle. Returns null when the id doesn't exist. */
export const updateFeedbackPostStatus = async (
  id: string,
  status: FeedbackStatus,
): Promise<FeedbackPostWithAttachments | null> => {
  const { count } = await prisma.feedbackPost.updateMany({
    where: { id, deletedAt: null },
    data: { status },
  });

  if (count === 0) return null;
  // Same shape the list returns, so the admin screen can patch the row it holds
  // instead of refetching the whole inbox after every status change.
  return prisma.feedbackPost.findUnique({
    where: { id },
    include: { attachments: { select: { id: true }, orderBy: { createdAt: 'asc' } } },
  });
};

/**
 * An admin's review decision: publish the report, or pull it down.
 *
 * `rejected` rather than a delete, because the row is the record of the
 * decision — what was taken down, when, and against which model verdict. The
 * hard delete below is the separate, deliberate act.
 */
export const setFeedbackModerationStatus = async (
  id: string,
  moderationStatus: FeedbackModerationDecision,
): Promise<FeedbackPostWithAttachments | null> => {
  const { count } = await prisma.feedbackPost.updateMany({
    where: { id, deletedAt: null },
    data: { moderationStatus, moderatedAt: new Date() },
  });

  if (count === 0) return null;
  return prisma.feedbackPost.findUnique({
    where: { id },
    include: { attachments: { select: { id: true }, orderBy: { createdAt: 'asc' } } },
  });
};

/**
 * Removes a report for good — row, screenshots and votes.
 *
 * A hard delete and not the soft one everything else in this schema uses: for
 * content an admin has judged harmful, "still in the table but filtered out of
 * every query" is not the outcome anybody asked for. The FK cascades on
 * `feedback_attachments` and `feedback_votes` take the bytes and the votes with
 * it. Returns false when the id was already gone, so a double click is a 404
 * rather than an error.
 */
export const deleteFeedbackPost = async (id: string): Promise<boolean> => {
  const { count } = await prisma.feedbackPost.deleteMany({ where: { id } });
  return count > 0;
};

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * Screenshots attached to a report.
 *
 * The bytes go in Postgres. There is no object store in this project — nothing
 * else here talks to Supabase Storage — and standing one up means a bucket,
 * signed uploads, a lifecycle policy and a moderation story. At three files of
 * 2 MB, already downscaled by the client, the table carries it.
 *
 * The declared content type is never trusted: `sniffImageType` reads the magic
 * bytes and the sniffed value is what gets stored, so a `.png` that is really
 * something else is rejected instead of being served back under a lying header.
 */
export const ATTACHMENT_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number];

export const ATTACHMENTS_MAX = 3;
export const ATTACHMENT_BYTES_MAX = 2 * 1024 * 1024;

/**
 * The real image type of `bytes`, from its magic number, or null when it is not
 * one of the three formats we accept. This is the only thing that decides what
 * `content_type` a row gets.
 */
export function sniffImageType(bytes: Uint8Array): AttachmentContentType | null {
  if (bytes.length < 12) return null;

  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return 'image/png';

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';

  return null;
}

export type FeedbackAttachmentInput = { contentType: AttachmentContentType; data: Uint8Array<ArrayBuffer> };

/**
 * Decodes one base64 payload into an attachment, or returns a reason it was
 * refused. Returning the reason rather than throwing lets the caller answer
 * with a 400 that says which file was the problem.
 */
export function decodeAttachment(
  value: unknown,
): { ok: true; value: FeedbackAttachmentInput } | { ok: false; reason: string } {
  if (typeof value !== 'string' || !value) return { ok: false, reason: 'Attachment must be a base64 string.' };

  // Accept a data URL too — that is what a browser's FileReader hands back, and
  // stripping the prefix here saves every caller from remembering to.
  const base64 = value.startsWith('data:') ? (value.split(',')[1] ?? '') : value;
  if (!base64) return { ok: false, reason: 'Attachment is empty.' };

  // Bound the encoded length before allocating: base64 is 4 chars per 3 bytes.
  if (base64.length > Math.ceil((ATTACHMENT_BYTES_MAX / 3) * 4) + 8) {
    return { ok: false, reason: 'Attachment is too large.' };
  }

  let data: Buffer;
  try {
    data = Buffer.from(base64, 'base64');
  } catch {
    return { ok: false, reason: 'Attachment is not valid base64.' };
  }

  if (data.length === 0) return { ok: false, reason: 'Attachment is empty.' };
  if (data.length > ATTACHMENT_BYTES_MAX) return { ok: false, reason: 'Attachment is too large.' };

  const contentType = sniffImageType(data);
  if (!contentType) return { ok: false, reason: 'Attachment must be a PNG, JPEG or WebP image.' };

  // Copied into a plain Uint8Array rather than handed over as the Buffer:
  // Prisma's `Bytes` input is typed against ArrayBuffer, and Node's Buffer is
  // generic over ArrayBufferLike (a pooled slice, possibly shared).
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  return { ok: true, value: { contentType, data: bytes } };
}

/**
 * The bytes of one attachment, for the public endpoint that serves it. Null
 * when the id is unknown OR its report is not public.
 *
 * The join to the post is the point. That endpoint is unauthenticated — an
 * `<img src>` cannot carry a session header — so without this it hands the
 * bytes to anyone holding the id, including the id of a picture the model
 * flagged or an admin took down. Filtering here is what makes a rejection
 * actually remove the image rather than only unlist it.
 *
 * The admin screen needs the opposite behaviour and has its own route
 * (apps/admin/src/app/api/admin/feedback/attachments/[id]) that reads the row
 * directly, behind the passcode.
 */
export const getFeedbackAttachment = async (id: string): Promise<{ contentType: string; data: Buffer } | null> => {
  const row = await prisma.feedbackAttachment.findFirst({
    where: { id, post: { deletedAt: null, moderationStatus: 'approved' } },
    select: { contentType: true, data: true },
  });
  if (!row) return null;
  return { contentType: row.contentType, data: Buffer.from(row.data) };
};

/** The bytes of one attachment with no visibility filter. Admin review only. */
export const getFeedbackAttachmentForReview = async (
  id: string,
): Promise<{ contentType: string; data: Buffer } | null> => {
  const row = await prisma.feedbackAttachment.findUnique({
    where: { id },
    select: { contentType: true, data: true },
  });
  if (!row) return null;
  return { contentType: row.contentType, data: Buffer.from(row.data) };
};

/**
 * Attachment ids per post, for building URLs in a list response. Ids only —
 * loading the bytes of a whole page of reports to answer "does it have a
 * screenshot" is how a board becomes slow.
 */
export const listAttachmentIdsByPost = async (postIds: string[]): Promise<Map<string, string[]>> => {
  const byPost = new Map<string, string[]>();
  if (postIds.length === 0) return byPost;

  const rows = await prisma.feedbackAttachment.findMany({
    where: { postId: { in: postIds } },
    select: { id: true, postId: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const row of rows) {
    const list = byPost.get(row.postId);
    if (list) list.push(row.id);
    else byPost.set(row.postId, [row.id]);
  }
  return byPost;
};

// ---------------------------------------------------------------------------
// The public board
// ---------------------------------------------------------------------------

export const FEEDBACK_SORTS = ['top', 'new'] as const;
export type FeedbackSort = (typeof FEEDBACK_SORTS)[number];

export const isFeedbackSort = (value: unknown): value is FeedbackSort =>
  typeof value === 'string' && (FEEDBACK_SORTS as readonly string[]).includes(value);

export type FeedbackBoardEntry = {
  id: string;
  kind: string;
  title: string;
  details: string;
  status: string;
  voteCount: number;
  hasVoted: boolean;
  /** The viewer filed this one. Their own report cannot be upvoted. */
  isOwn: boolean;
  authorNickname: string | null;
  attachmentIds: string[];
  createdTimestamp: number;
};

/**
 * The board a user sees: reports of one kind, most-voted or newest first.
 *
 * Deliberately narrower than the admin list. `walletAddress`, `userAgent` and
 * `locale` never leave the server here — the board exists so people can second
 * a report, not so they can see who filed it from which browser. The author's
 * nickname is the one identifying field, and it is already public elsewhere in
 * the app.
 *
 * `closed` reports are hidden: they are the ones triage decided are not real,
 * and leaving them collecting votes wastes everyone's attention.
 */
export const listFeedbackBoard = async ({
  kind,
  viewerProfileId,
  sort = 'top',
  limit = 50,
}: {
  kind?: FeedbackKind;
  viewerProfileId: number | null;
  sort?: FeedbackSort;
  limit?: number;
}): Promise<FeedbackBoardEntry[]> => {
  const take = Math.min(Math.max(limit, 1), 100);

  const posts = await prisma.feedbackPost.findMany({
    where: {
      deletedAt: null,
      status: { not: 'closed' },
      // The review gate. Everything else — `pending` because the check could
      // not be completed, `flagged` because the model objected, `rejected`
      // because an admin pulled it — stays off the board until a human says so.
      moderationStatus: 'approved',
      ...(kind ? { kind } : {}),
    },
    orderBy:
      sort === 'new'
        ? [{ createdAt: 'desc' }]
        : // Newest breaks the tie, so a fresh report is not stranded below an
          // older one both sitting at zero votes.
          [{ voteCount: 'desc' }, { createdAt: 'desc' }],
    take,
    select: {
      id: true,
      kind: true,
      title: true,
      details: true,
      status: true,
      voteCount: true,
      createdAt: true,
      profileId: true,
      profile: { select: { nickname: true } },
    },
  });

  const ids = posts.map((p) => p.id);
  const [attachments, myVotes] = await Promise.all([
    listAttachmentIdsByPost(ids),
    viewerProfileId === null
      ? Promise.resolve([] as { postId: string }[])
      : prisma.feedbackVote.findMany({
          where: { profileId: viewerProfileId, postId: { in: ids } },
          select: { postId: true },
        }),
  ]);
  const voted = new Set(myVotes.map((v) => v.postId));

  return posts.map((post) => ({
    id: post.id,
    kind: post.kind,
    title: post.title,
    details: post.details,
    status: post.status,
    voteCount: post.voteCount,
    hasVoted: voted.has(post.id),
    // A report filed without a profile row has `profileId === null`, and so does
    // a viewer without one. Comparing them directly would make every anonymous
    // report look like it belonged to every anonymous viewer.
    isOwn: viewerProfileId !== null && post.profileId === viewerProfileId,
    authorNickname: post.profile?.nickname ?? null,
    attachmentIds: attachments.get(post.id) ?? [],
    createdTimestamp: post.createdAt.getTime(),
  }));
};

/**
 * Outcome of a vote toggle. A union rather than a nullable result because the
 * two failures need different answers: an unknown post is a 404, voting on your
 * own report is a 403, and collapsing both into `null` would have the API tell
 * a user their own report does not exist.
 */
export type ToggleFeedbackVoteResult =
  | { ok: true; voteCount: number; hasVoted: boolean }
  | { ok: false; reason: 'not-found' | 'own-post' };

/**
 * Adds or removes this profile's vote and returns the resulting state.
 *
 * The count and the vote row move together in one transaction, so the
 * denormalized `vote_count` cannot drift from the rows it summarizes. The
 * unique `(post_id, profile_id)` is what makes a retried request a no-op rather
 * than a second vote: an insert that collides means the vote already existed,
 * which is the same outcome the client was asking for. When that happens the
 * handler re-reads the live state instead of guessing at it.
 *
 * Voting on your own report is refused HERE, not only in the UI: the vote count
 * is what triage sorts by, so a self-vote is the one input that makes the number
 * mean something other than "other people hit this too". The board hides the
 * button, but the button is not the rule.
 */
export const toggleFeedbackVote = async ({
  postId,
  profileId,
}: {
  postId: string;
  profileId: number;
}): Promise<ToggleFeedbackVoteResult> => {
  const post = await prisma.feedbackPost.findFirst({
    // Same predicate as the board: a held post is not listed, so a vote on one
    // can only have come from an id somebody kept or guessed.
    where: { id: postId, deletedAt: null, moderationStatus: 'approved' },
    select: { id: true, profileId: true },
  });
  if (!post) return { ok: false, reason: 'not-found' };
  if (post.profileId !== null && post.profileId === profileId) return { ok: false, reason: 'own-post' };

  const existing = await prisma.feedbackVote.findUnique({
    where: { postId_profileId: { postId, profileId } },
    select: { id: true },
  });

  const updated = await prisma.$transaction(async (tx) => {
    if (existing) {
      const { count } = await tx.feedbackVote.deleteMany({ where: { postId, profileId } });
      if (count === 0) return null;
      return tx.feedbackPost.update({
        where: { id: postId },
        data: { voteCount: { decrement: count } },
        select: { voteCount: true },
      });
    }

    try {
      await tx.feedbackVote.create({ data: { postId, profileId } });
    } catch {
      return null;
    }
    return tx.feedbackPost.update({
      where: { id: postId },
      data: { voteCount: { increment: 1 } },
      select: { voteCount: true },
    });
  });

  if (!updated) {
    const [current, still] = await Promise.all([
      prisma.feedbackPost.findUnique({ where: { id: postId }, select: { voteCount: true } }),
      prisma.feedbackVote.findUnique({ where: { postId_profileId: { postId, profileId } }, select: { id: true } }),
    ]);
    return { ok: true, voteCount: Math.max(current?.voteCount ?? 0, 0), hasVoted: Boolean(still) };
  }

  return { ok: true, voteCount: Math.max(updated.voteCount, 0), hasVoted: !existing };
};
