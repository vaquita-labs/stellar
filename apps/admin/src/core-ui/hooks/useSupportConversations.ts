import { clientEnv } from '@/core-ui/config/clientEnv';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SupportConversationDetail,
  SupportConversationStatus,
  SupportConversationSummary,
  SupportMessageDTO,
} from '@vaquita/shared/services/support/index';

// Type-only import: importing a value from @vaquita/shared into a client
// component would pull Prisma into the browser bundle (see useFeedback.ts).
export type { SupportConversationDetail, SupportConversationStatus, SupportConversationSummary, SupportMessageDTO };

/** Mirror of SUPPORT_MESSAGE_MAX in packages/shared/src/services/support. Keep in sync. */
export const SUPPORT_MESSAGE_MAX = 2000;

// No websockets: the inbox and the open thread poll. The thread polls faster
// because that is where someone is waiting on a reply in real time.
const INBOX_POLL_MS = 10_000;
const THREAD_POLL_MS = 5_000;

const SUPPORT_URL = '/api/admin/support';
const inboxKey = ['admin', 'support'] as const;
const threadKey = (id: string) => ['admin', 'support', id] as const;

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

const request = async <T>(url: string, init: RequestInit, fallback: string): Promise<T> => {
  const response = await fetch(url, { ...init, headers: adminHeaders() });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.data) throw new Error(body?.message ?? fallback);
  return body.data as T;
};

export const useSupportConversations = () =>
  useQuery<SupportConversationSummary[]>({
    queryKey: inboxKey,
    refetchInterval: INBOX_POLL_MS,
    queryFn: async () =>
      (await request<{ conversations: SupportConversationSummary[] }>(SUPPORT_URL, {}, 'Failed to load the inbox'))
        .conversations,
  });

export const useSupportThread = (id: string | null) =>
  useQuery<SupportConversationDetail>({
    queryKey: threadKey(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: THREAD_POLL_MS,
    queryFn: async () =>
      (
        await request<{ conversation: SupportConversationDetail }>(
          `${SUPPORT_URL}/${id}`,
          {},
          'Failed to load the thread'
        )
      ).conversation,
  });

export const useSupportReply = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation<SupportMessageDTO, Error, string>({
    mutationFn: async (body) =>
      (
        await request<{ message: SupportMessageDTO }>(
          `${SUPPORT_URL}/${id}`,
          { method: 'POST', body: JSON.stringify({ body }) },
          'Failed to send the reply'
        )
      ).message,
    onSuccess: (message) => {
      // Appended right away so the reply does not wait for the next poll.
      queryClient.setQueryData<SupportConversationDetail>(threadKey(id), (thread) =>
        thread ? { ...thread, status: 'answered', messages: [...thread.messages, message] } : thread
      );
      void queryClient.invalidateQueries({ queryKey: inboxKey });
    },
  });
};

export const useSupportResolve = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, boolean>({
    mutationFn: (resolved) =>
      request(
        `${SUPPORT_URL}/${id}`,
        { method: 'PATCH', body: JSON.stringify({ resolved }) },
        'Failed to update the conversation'
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKey });
    },
  });
};
