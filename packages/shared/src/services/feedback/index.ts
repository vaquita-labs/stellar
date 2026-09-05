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

export const toFeedbackPostResponseDTO = (row: FeedbackPost): FeedbackPostResponseDTO => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  details: row.details,
  status: row.status,
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
}: {
  profileId: number | null;
  walletAddress: string;
  kind: FeedbackKind;
  title: string;
  details: string;
  locale?: string | null;
  userAgent?: string | null;
  appPath?: string | null;
}): Promise<FeedbackPost> =>
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
    },
  });

/**
 * The admin inbox. Both filters are optional so the default view is "everything,
 * newest first"; `limit` is capped by the caller.
 */
export const listFeedbackPosts = async ({
  kind,
  status,
  limit = 100,
}: {
  kind?: FeedbackKind;
  status?: FeedbackStatus;
  limit?: number;
} = {}): Promise<FeedbackPost[]> =>
  prisma.feedbackPost.findMany({
    where: {
      deletedAt: null,
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });

/** Moves a report along the triage lifecycle. Returns null when the id doesn't exist. */
export const updateFeedbackPostStatus = async (id: string, status: FeedbackStatus): Promise<FeedbackPost | null> => {
  const { count } = await prisma.feedbackPost.updateMany({
    where: { id, deletedAt: null },
    data: { status },
  });

  if (count === 0) return null;
  return prisma.feedbackPost.findUnique({ where: { id } });
};
