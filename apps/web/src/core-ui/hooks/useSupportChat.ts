import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type SupportChatAuthor = 'user' | 'team';

export type SupportChatMessage = {
  id: string;
  author: SupportChatAuthor;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
};

/** Mirror of SUPPORT_MESSAGE_MAX in packages/shared/src/services/support. Keep in sync. */
export const SUPPORT_MESSAGE_MAX = 2000;

// No websockets: the thread polls while the chat screen is mounted. React Query
// pauses the interval while the tab is hidden.
const POLL_MS = 5_000;

const MESSAGES_URL = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/support/messages`;

const threadKey = (wallet: string | null | undefined) => ['support-chat', wallet] as const;

/** The private thread with the team, oldest message first. */
export function useSupportChat() {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  const thread = useQuery<SupportChatMessage[]>({
    queryKey: threadKey(walletAddress),
    enabled: Boolean(walletAddress),
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const response = await authFetch(MESSAGES_URL(), { method: 'GET' }, walletAddress!);
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) throw new Error(body?.message ?? 'Failed to load the conversation');
      return (body.data.messages ?? []) as SupportChatMessage[];
    },
  });

  const send = useMutation<SupportChatMessage, Error, string>({
    mutationFn: async (text) => {
      if (!walletAddress) throw new Error('No connected wallet');
      const response = await authFetch(
        MESSAGES_URL(),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) },
        walletAddress,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) throw new Error(body?.message ?? 'Failed to send your message');
      return body.data.message as SupportChatMessage;
    },
    // Appended right away so the message does not wait for the next poll. The
    // id check covers a poll that already brought it back.
    onSuccess: (message) => {
      queryClient.setQueryData<SupportChatMessage[]>(threadKey(walletAddress), (messages = []) =>
        messages.some((m) => m.id === message.id) ? messages : [...messages, message],
      );
    },
  });

  return {
    messages: thread.data ?? [],
    isLoading: thread.isLoading,
    isError: thread.isError && !thread.data,
    send: send.mutate,
    isSending: send.isPending,
  };
}
