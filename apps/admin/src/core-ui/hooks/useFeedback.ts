import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

/**
 * Mirror of the backend's feedback vocabulary
 * (packages/shared/src/services/feedback/index.ts). Keep in sync.
 *
 * Copied rather than imported on purpose: `@vaquita/shared` is listed in
 * `transpilePackages`, so importing a *value* from its root barrel into a
 * client component makes Turbopack compile the whole barrel — Prisma, pg and
 * web-push included — for the browser, and the build dies on `dns`/`net`/`tls`.
 * Types are erased and would be safe; a local list keeps the rule simple.
 */
export const FEEDBACK_KINDS = ['bug', 'feedback'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Triage lifecycle. Distinct from the moderation verdict below. */
export const FEEDBACK_STATUSES = ['open', 'planned', 'in_progress', 'done', 'closed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * Content-moderation verdict. Only 'approved' is on the public board;
 * 'pending' means the check could not be completed, not that it passed.
 */
export const FEEDBACK_MODERATION_STATUSES = ['pending', 'approved', 'flagged', 'rejected'] as const;
export type FeedbackModerationStatus = (typeof FEEDBACK_MODERATION_STATUSES)[number];

/** What an admin may set. They review; the pipeline is what authors a verdict. */
export type FeedbackModerationDecision = 'approved' | 'rejected';

/**
 * The model's answer as stored, or `{ error }` when there was none. Loosely
 * typed on purpose: it is displayed, never branched on beyond `categories`.
 */
export interface FeedbackModerationResult {
  flagged?: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
  error?: string;
}

/**
 * Shape of a `feedback_posts` row as returned by the admin API route. Richer
 * than the DTO the public API hands back: the triage screen needs the wallet
 * and the user agent, and this route is behind ADMIN_SECRET.
 */
export interface FeedbackPostRow {
  id: string;
  profileId: number | null;
  walletAddress: string;
  kind: FeedbackKind;
  title: string;
  details: string;
  status: FeedbackStatus;
  moderationStatus: FeedbackModerationStatus;
  moderationResult: FeedbackModerationResult | null;
  moderatedAt: string | null;
  locale: string | null;
  userAgent: string | null;
  appPath: string | null;
  voteCount: number;
  /** Screenshot ids; the bytes come from the public API endpoint that serves them. */
  attachmentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackFilters {
  kind?: FeedbackKind;
  status?: FeedbackStatus;
  /** A single verdict, or 'review' — the server's alias for pending + flagged. */
  moderationStatus?: FeedbackModerationStatus | 'review';
}

// Same-origin route handler inside this admin app; only the screenshots below
// come from apps/api.
const FEEDBACK_URL = '/api/admin/feedback';

/**
 * Screenshots come from this app's own route, not from apps/api.
 *
 * The public endpoint serves approved reports only — exactly the ones a
 * reviewer does not need to look at. The route here reads the bytes with no
 * visibility filter and is protected by the passcode middleware, which works on
 * an `<img src>` because the cookie rides along where a header cannot.
 */
export const feedbackAttachmentUrl = (id: string) => `/api/admin/feedback/attachments/${id}`;

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

/** Read the triage inbox, optionally narrowed by kind and/or status. */
export const useFeedbackPosts = (filters: FeedbackFilters = {}) =>
  useQuery<FeedbackPostRow[]>({
    // The filters are part of the key so switching tabs refetches instead of
    // painting the previous tab's rows.
    queryKey: ['admin', 'feedback', filters.kind ?? 'all', filters.status ?? 'all', filters.moderationStatus ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.kind) params.set('kind', filters.kind);
      if (filters.status) params.set('status', filters.status);
      if (filters.moderationStatus) params.set('moderationStatus', filters.moderationStatus);
      const query = params.toString();

      const response = await fetch(query ? `${FEEDBACK_URL}?${query}` : FEEDBACK_URL, { headers: adminHeaders() });
      const data = await response.json();
      return (data?.data?.posts ?? []) as FeedbackPostRow[];
    },
  });

const parseError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {
    /* ignore */
  }
  return fallback;
};

const patchFeedback = async (body: Record<string, unknown>, fallback: string): Promise<FeedbackPostRow> => {
  const response = await fetch(FEEDBACK_URL, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await parseError(response, fallback));
  const data = await response.json();
  return data?.data?.post as FeedbackPostRow;
};

/** Move one report along the triage lifecycle. */
export const updateFeedbackStatus = (id: string, status: FeedbackStatus): Promise<FeedbackPostRow> =>
  patchFeedback({ id, status }, 'Failed to update report');

/**
 * Publish a report, or pull it down.
 *
 * Rejecting is the reversible half of the pair below: the row stays, so what
 * was taken down and against which verdict remains on the record.
 */
export const updateFeedbackModeration = (id: string, moderationStatus: FeedbackModerationDecision) =>
  patchFeedback({ id, moderationStatus }, 'Failed to update moderation');

/**
 * Remove a report for good — row, screenshots and votes.
 *
 * Irreversible, and the screen puts a confirm in front of it. This exists for
 * content that should not stay in the table at all; anything short of that is a
 * rejection.
 */
export const deleteFeedbackPost = async (id: string): Promise<void> => {
  const response = await fetch(`${FEEDBACK_URL}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to delete report'));
};
