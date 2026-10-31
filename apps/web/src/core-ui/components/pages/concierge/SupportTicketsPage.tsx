'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiPlus } from 'react-icons/fi';
import { type SupportTicket, type SupportTicketStatus, useSupportTickets } from '../../../hooks/useSupportChat';
import { PageLayout } from '../../molecules/PageLayout';
import { PressableButton } from '../../molecules/PressableButton';

const STATUS_CLASSES: Record<SupportTicketStatus, string> = {
  waiting: 'bg-[#FFF7E6] text-[#9A6B00]',
  answered: 'bg-[#E8F5D6] text-[#3F9102]',
  resolved: 'bg-black/5 text-gray-600',
};

/**
 * The user's conversations with the team, one per issue, most recent first.
 * Each opens its own chat; the button starts a new one. A resolved issue stays
 * here, so the user can read it again or write into it to reopen it.
 */
export function SupportTicketsPage() {
  const { t, i18n } = useTranslation();
  const tickets = useSupportTickets();

  const statusLabel = (status: SupportTicketStatus) =>
    status === 'waiting'
      ? t('supportChat.status.waiting', 'Waiting for reply')
      : status === 'answered'
        ? t('supportChat.status.answered', 'Answered')
        : t('supportChat.status.resolved', 'Resolved');

  const when = (iso: string) => {
    const date = new Date(iso);
    const today = new Date();
    const sameDay =
      date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    return sameDay
      ? date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  };

  const row = (ticket: SupportTicket) => (
    <Link
      key={ticket.id}
      href={`/concierge/chat/${ticket.id}`}
      className="flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3 transition active:translate-y-[1px] active:border-b"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-bold text-black">{ticket.subject}</span>
        {ticket.lastMessage && (
          <span className="truncate text-xs text-gray-500">
            {ticket.lastMessage.author === 'team' ? `${t('supportChat.teamName', 'Vaquita team')}: ` : ''}
            {ticket.lastMessage.body}
          </span>
        )}
        <span className="flex items-center gap-2 text-[11px]">
          <span className={`rounded px-1.5 py-0.5 font-semibold ${STATUS_CLASSES[ticket.status]}`}>
            {statusLabel(ticket.status)}
          </span>
          <span className="text-gray-400">{when(ticket.lastMessageAt)}</span>
        </span>
      </span>
      <FiChevronRight className="h-5 w-5 shrink-0 text-black/40" />
    </Link>
  );

  return (
    <PageLayout title={t('supportChat.listTitle', 'Your conversations')} backHref="/concierge" contentGap="gap-3">
      <Link href="/concierge/chat/new" className="block">
        <PressableButton variant="success" size="md" fullWidth onClick={() => undefined}>
          <span className="flex items-center gap-2">
            <FiPlus className="h-5 w-5" />
            {t('supportChat.new', 'New conversation')}
          </span>
        </PressableButton>
      </Link>

      {tickets.isPending ? null : tickets.isError ? (
        <p className="py-10 text-center text-sm text-gray-500">
          {t('supportChat.listError', 'We could not load your conversations. Pull to refresh.')}
        </p>
      ) : tickets.data.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          {t('supportChat.listEmpty', 'Nothing yet. Start a conversation and it stays here, so you can always come back.')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">{tickets.data.map(row)}</div>
      )}
    </PageLayout>
  );
}
