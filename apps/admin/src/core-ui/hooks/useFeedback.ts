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
}

// Same-origin route handler inside this admin app; only the screenshots below
// come from apps/api.
const FEEDBACK_URL = '/api/admin/feedback';

/**
 * Screenshots are served by apps/api, not by this admin app: the bytes live in
 * Postgres and only that service has a route for them. The endpoint is
 * unauthenticated by design (an `<img src>` cannot carry a header), so this is
 * the same URL the in-app board uses.
 */
export const feedbackAttachmentUrl = (id: string) =>
  `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/feedback/attachments/${id}`;

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

/** Read the triage inbox, optionally narrowed by kind and/or status. */
export const useFeedbackPosts = (filters: FeedbackFilters = {}) =>
  useQuery<FeedbackPostRow[]>({
    // The filters are part of the key so switching tabs refetches instead of
    // painting the previous tab's rows.
    queryKey: ['admin', 'feedback', filters.kind ?? 'all', filters.status ?? 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.kind) params.set('kind', filters.kind);
      if (filters.status) params.set('status', filters.status);
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

/** Move one report along the triage lifecycle. */
export const updateFeedbackStatus = async (id: string, status: FeedbackStatus): Promise<FeedbackPostRow> => {
  const response = await fetch(FEEDBACK_URL, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify({ id, status }),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to update report'));
  const data = await response.json();
  return data?.data?.post as FeedbackPostRow;
};
