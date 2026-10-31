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

export type SupportTicketStatus = 'waiting' | 'answered' | 'resolved';

/** One issue raised with the team, as the list shows it. */
export type SupportTicket = {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  openedAt: string;
  resolvedAt: string | null;
  lastMessageAt: string;
  lastMessage: SupportChatMessage | null;
};

export type SupportTicketDetail = SupportTicket & { messages: SupportChatMessage[] };

/** Mirror of SUPPORT_MESSAGE_MAX in packages/shared/src/services/support. Keep in sync. */
export const SUPPORT_MESSAGE_MAX = 2000;

// No websockets: the open ticket polls while its screen is mounted. React
// Query pauses the interval while the tab is hidden.
const POLL_MS = 5_000;

const SUPPORT_URL = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/support`;

const ticketsKey = (wallet: string | null | undefined) => ['support-tickets', wallet] as const;
const ticketKey = (wallet: string | null | undefined, id: string | null) => ['support-ticket', wallet, id] as const;

const readData = async <T>(response: Response, fallback: string): Promise<T> => {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.data) throw new Error(body?.message ?? fallback);
  return body.data as T;
};

/**
 * Before the server knows about tickets, the wallet has one thread: it is shown
 * as a single ticket under this id, read and written through the old routes,
 * so the list and the chat work the same either way.
 */
export const LEGACY_THREAD_ID = 'thread';

const legacyThread = async (walletAddress: string): Promise<SupportTicketDetail | null> => {
  const response = await authFetch(`${SUPPORT_URL()}/messages`, { method: 'GET' }, walletAddress);
  const messages = (await readData<{ messages: SupportChatMessage[] }>(response, 'Failed to load the conversation')).messages;
  if (messages.length === 0) return null;
  const first = messages[0]!;
  const last = messages[messages.length - 1]!;
  return {
    id: LEGACY_THREAD_ID,
    subject: first.body.replace(/\s+/g, ' ').trim().slice(0, 120),
    status: last.author === 'team' ? 'answered' : 'waiting',
    openedAt: first.createdAt,
    resolvedAt: null,
    lastMessageAt: last.createdAt,
    lastMessage: last,
    messages,
  };
};

/** The user's tickets, most recent activity first. */
export function useSupportTickets() {
  const { walletAddress } = useConfigStore();
  return useQuery<SupportTicket[]>({
    queryKey: ticketsKey(walletAddress),
    enabled: Boolean(walletAddress),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 1,
    queryFn: async () => {
      const response = await authFetch(`${SUPPORT_URL()}/tickets`, { method: 'GET' }, walletAddress!);
      if (response.status === 404) {
        const thread = await legacyThread(walletAddress!);
        return thread ? [thread] : [];
      }
      return (await readData<{ tickets: SupportTicket[] }>(response, 'Failed to load your conversations')).tickets;
    },
  });
}

/**
 * One ticket with its messages, oldest first, polled while open. `null` id is
 * a conversation not started yet: nothing to read until the first message.
 */
export function useSupportTicket(ticketId: string | null) {
  const { walletAddress } = useConfigStore();
  return useQuery<SupportTicketDetail>({
    queryKey: ticketKey(walletAddress, ticketId),
    enabled: Boolean(walletAddress) && ticketId !== null,
    refetchInterval: POLL_MS,
    retry: 1,
    queryFn: async () => {
      if (ticketId === LEGACY_THREAD_ID) {
        const thread = await legacyThread(walletAddress!);
        return thread ?? { ...EMPTY_LEGACY, openedAt: new Date().toISOString(), lastMessageAt: new Date().toISOString() };
      }
      const response = await authFetch(`${SUPPORT_URL()}/tickets/${ticketId}`, { method: 'GET' }, walletAddress!);
      return (await readData<{ ticket: SupportTicketDetail }>(response, 'Failed to load the conversation')).ticket;
    },
  });
}

const EMPTY_LEGACY: Omit<SupportTicketDetail, 'openedAt' | 'lastMessageAt'> = {
  id: LEGACY_THREAD_ID,
  subject: '',
  status: 'waiting',
  resolvedAt: null,
  lastMessage: null,
  messages: [],
};

/**
 * Sends a message. Into the given ticket (which reopens it if it was resolved),
 * or, with no ticket, into a new one; the answer says where it landed. A server
 * that predates tickets answers without `ticketId`: the message is stored in
 * the wallet's thread all the same, and the caller keeps it on screen itself.
 */
export function useSendSupportMessage() {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();
  return useMutation<{ message: SupportChatMessage; ticketId: string }, Error, { body: string; ticketId: string | null }>({
    mutationFn: async ({ body, ticketId }) => {
      if (!walletAddress) throw new Error('No connected wallet');
      const response = await authFetch(
        `${SUPPORT_URL()}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, ...(ticketId && ticketId !== LEGACY_THREAD_ID ? { ticketId } : {}) }),
        },
        walletAddress,
      );
      const data = await readData<{ message: SupportChatMessage; ticketId?: string }>(response, 'Failed to send your message');
      // No ticket from the server: the message went to the one thread, shown as the legacy ticket.
      return { message: data.message, ticketId: typeof data.ticketId === 'string' ? data.ticketId : LEGACY_THREAD_ID };
    },
    // Appended right away so the message does not wait for the next poll. The
    // id check covers a poll that already brought it back.
    onSuccess: ({ message, ticketId }) => {
      queryClient.setQueryData<SupportTicketDetail>(ticketKey(walletAddress, ticketId), (ticket) =>
        ticket
          ? {
              ...ticket,
              status: 'waiting',
              resolvedAt: null,
              lastMessage: message,
              lastMessageAt: message.createdAt,
              messages: ticket.messages.some((m) => m.id === message.id) ? ticket.messages : [...ticket.messages, message],
            }
          : ticket,
      );
      void queryClient.invalidateQueries({ queryKey: ticketsKey(walletAddress) });
    },
  });
}
