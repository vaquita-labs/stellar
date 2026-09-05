import { clientEnv } from '@/core-ui/config/clientEnv';
import type { FeedbackKind, FeedbackStatus } from '@vaquita/shared';
import { useQuery } from '@tanstack/react-query';

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
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackFilters {
  kind?: FeedbackKind;
  status?: FeedbackStatus;
}

// Same-origin route handler inside this admin app — no NEXT_PUBLIC_SERVICES_URL.
const FEEDBACK_URL = '/api/admin/feedback';

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
