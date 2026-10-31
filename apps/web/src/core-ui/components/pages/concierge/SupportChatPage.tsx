'use client';

import { toast } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSend } from 'react-icons/fi';
import { PageHeader } from '../../molecules/PageHeader';
import {
  SUPPORT_MESSAGE_MAX,
  SupportChatMessage,
  useSendSupportMessage,
  useSupportTicket,
} from '../../../hooks/useSupportChat';

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * One conversation with the Vaquita team: an existing ticket, or a new one
 * (`ticketId` null) that comes to exist with the first message, after which
 * the URL moves to it. Laid out as a fixed column instead of PageLayout: the
 * composer has to stay pinned to the bottom while only the message list scrolls.
 * A resolved ticket still takes messages; writing reopens it.
 */
export function SupportChatPage({ ticketId }: { ticketId: string | null }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const ticket = useSupportTicket(ticketId);
  const sendMessage = useSendSupportMessage();
  // What was sent from this screen before it has a ticket to read from (a new
  // conversation, or a server that does not hand back the ticket yet).
  const [sent, setSent] = useState<SupportChatMessage[]>([]);
  const fromServer = ticket.data?.messages ?? [];
  const messages = [...fromServer, ...sent.filter((m) => !fromServer.some((s) => s.id === m.id))];
  const isLoading = ticketId !== null && ticket.isPending;
  const isError = ticketId !== null && ticket.isError && !ticket.data;
  const isSending = sendMessage.isPending;
  const resolved = ticket.data?.status === 'resolved';
  const [draft, setDraft] = useState('');
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || isSending) return;
    // The draft is cleared only once the message is stored: a failed send must
    // not eat what the user just typed.
    sendMessage.mutate(
      { body: draft.trim(), ticketId },
      {
        onSuccess: ({ message, ticketId: landedIn }) => {
          setDraft('');
          setSent((list) => [...list, message]);
          // The first message of a new conversation gives it its id: from here on the screen is that ticket's.
          if (ticketId === null) router.replace(`/concierge/chat/${landedIn}`);
        },
        onError: (err) => toast.danger(t('supportChat.sendError', 'Could not send your message'), { description: err.message }),
      },
    );
  };

  // Enter sends and Shift+Enter breaks the line, but only with a physical
  // keyboard: on touch keyboards Enter is the only way to write a new line.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    e.preventDefault();
    submit();
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const formatDay = (iso: string) => {
    const date = new Date(iso);
    if (isSameDay(date, new Date())) return t('supportChat.today', 'Today');
    return date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 pt-6 sm:pt-8">
      <PageHeader title={t('supportChat.title', 'Vaquita team')} backHref="/concierge/chat" />
      <p className="text-center text-xs text-gray-500">
        {resolved
          ? t('supportChat.resolvedNote', 'This one was resolved. Write again and it reopens.')
          : t('supportChat.subtitle', 'Private chat. Only you and the team can see it.')}
      </p>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-4">
        {isLoading ? null : isError ? (
          <p className="m-auto max-w-xs text-center text-sm text-gray-500">
            {t('supportChat.loadError', 'We could not load the conversation. Retrying…')}
          </p>
        ) : messages.length === 0 ? (
          <p className="m-auto max-w-xs text-center text-sm text-gray-500">
            {t('supportChat.empty', 'Write us whatever you need. We usually reply within a few hours.')}
          </p>
        ) : (
          messages.map((message, i) => {
            const prev: SupportChatMessage | undefined = messages[i - 1];
            const showDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(message.createdAt));
            const mine = message.author === 'user';
            return (
              <div key={message.id} className="flex flex-col gap-2">
                {showDay ? (
                  <span className="self-center rounded-full bg-white/70 px-3 py-0.5 text-xs text-gray-500">
                    {formatDay(message.createdAt)}
                  </span>
                ) : null}
                <div
                  className={`flex max-w-[80%] flex-col gap-1 rounded-2xl border border-black border-b-2 px-3 py-2 ${
                    mine ? 'self-end rounded-br-sm bg-primary' : 'self-start rounded-bl-sm bg-white'
                  }`}
                >
                  {!mine ? (
                    <span className="text-xs font-bold text-black">{t('supportChat.teamName', 'Vaquita team')}</span>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-sm text-black">{message.body}</p>
                  <span className="self-end text-[10px] text-black/60 tabular-nums">{formatTime(message.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 pb-6 pt-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('supportChat.placeholder', 'Write a message…')}
          aria-label={t('supportChat.placeholder', 'Write a message…')}
          maxLength={SUPPORT_MESSAGE_MAX}
          rows={1}
          className="field-sizing-content max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-black border-b-2 bg-white px-4 py-2.5 text-sm leading-relaxed text-black outline-none placeholder:text-gray-400 focus:border-b-3"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isSending}
          aria-label={t('supportChat.send', 'Send')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black border-b-2 bg-primary transition active:translate-y-[2px] active:border-b disabled:opacity-50"
        >
          <FiSend className="h-5 w-5 text-black" />
        </button>
      </form>
    </div>
  );
}
