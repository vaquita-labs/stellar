'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaWhatsapp } from 'react-icons/fa';
import { FiChevronRight, FiHeadphones, FiMessageSquare, FiTrendingUp } from 'react-icons/fi';
import { IconType } from 'react-icons';
import { PageLayout } from '../../molecules';
import { FeedbackBoardSheet } from '../../organisms/FeedbackBoard';
import { ReportSheet } from '../../organisms/ReportSheet';
import { FeedbackKind } from '../../../hooks/useSubmitFeedback';

/** Invite link to the community WhatsApp group. */
const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/Gke3pHEdVLT6WsUi8kV3cD?mode=gi_t';

/**
 * Reemplaza al viejo centro de notificaciones detrás del botón del header: una
 * pantalla de contacto (Concierge) con todas las formas de hablar con el equipo.
 *
 * Three are live channels (the private chat with the team, the WhatsApp group
 * and the support inbox, `NEXT_PUBLIC_SUPPORT_EMAIL`), two are forms that stay
 * on record (feedback and bug), and the last one is the public board of what
 * other users sent.
 */
export function ConciergePage() {
  const { t } = useTranslation();
  // Qué formulario está abierto. Un solo estado en vez de dos booleanos: no
  // pueden estar abiertos los dos a la vez, y así el sheet se monta una sola vez.
  const [reportKind, setReportKind] = useState<FeedbackKind | null>(null);
  // El board se abre por encima del Concierge y el formulario por encima del
  // board: mandar algo desde el board tiene que devolver al board, no al menú.
  const [boardKind, setBoardKind] = useState<FeedbackKind | null>(null);

  const rows: {
    key: string;
    icon: IconType;
    label: string;
    hint: string;
    href?: string;
    external?: boolean;
    onPress?: () => void;
  }[] = [
    {
      key: 'whatsapp',
      icon: FaWhatsapp,
      label: t('concierge.whatsapp', 'WhatsApp group'),
      hint: t('concierge.whatsappHint', 'The savers community, with the team inside.'),
      href: WHATSAPP_GROUP_URL,
      external: true,
    },
    // One form for everything the user wants to tell us: an idea, a complaint,
    // a bug. The kind is decided by what they write, not by which card they hit.
    {
      key: 'feedback',
      icon: FiMessageSquare,
      label: t('concierge.feedback', 'Tell us something'),
      hint: t('concierge.feedbackHint', 'An idea, a complaint or something that broke.'),
      onPress: () => setReportKind('feedback'),
    },
    {
      key: 'board',
      icon: FiTrendingUp,
      label: t('concierge.board', 'What others asked for'),
      hint: t('concierge.boardHint', 'Ideas and bugs from other users, and their status.'),
      onPress: () => setBoardKind('bug'),
    },
  ];

  const rowClasses =
    'flex w-full items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3 text-left transition active:translate-y-[1px] active:border-b';
  const rowInner = (Icon: IconType, label: string, hint: string) => (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background">
        <Icon className="h-5 w-5 text-black" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-bold text-black">{label}</span>
        <span className="text-xs text-gray-500">{hint}</span>
      </span>
      <FiChevronRight className="h-5 w-5 shrink-0 text-black/40" />
    </>
  );

  return (
    <PageLayout title={t('concierge.title', 'Help Center')} backHref="/home" contentGap="gap-3" contentClassName="flex-1">
      {/* The way in that matters most, on its own: a private chat with the team. */}
      <Link
        href="/concierge/chat"
        className="flex items-center gap-4 rounded-lg border border-black border-b-2 bg-primary px-4 py-5 transition active:translate-y-[1px] active:border-b"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-black bg-white">
          <FiHeadphones className="h-7 w-7 text-black" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg font-bold text-black">{t('concierge.chat', 'Chat with us')}</span>
          <span className="text-sm text-black/70">
            {t('concierge.chatHint', 'A private chat with the Vaquita team. We answer the same day.')}
          </span>
        </span>
        <FiChevronRight className="h-6 w-6 shrink-0 text-black/60" />
      </Link>

      {/* WhatsApp right under the chat; the two about feedback sit at the bottom, out of the way. */}
      <div className="flex flex-col gap-2">
        {rows.slice(0, 1).map(({ key, icon, label, hint, href, external, onPress }) =>
          href ? (
            <a
              key={key}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className={rowClasses}
            >
              {rowInner(icon, label, hint)}
            </a>
          ) : (
            <button key={key} type="button" onClick={onPress} className={rowClasses}>
              {rowInner(icon, label, hint)}
            </button>
          ),
        )}
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        {rows.slice(1).map(({ key, icon, label, hint, onPress }) => (
          <button key={key} type="button" onClick={onPress} className={rowClasses}>
            {rowInner(icon, label, hint)}
          </button>
        ))}
      </div>

      {/* `kind` se congela mientras cierra: si se pusiera a null de una, el sheet
          cambiaría de copy durante la animación de salida. */}
      {boardKind ? (
        <FeedbackBoardSheet open onOpenChange={() => setBoardKind(null)} initialKind={boardKind} onCreate={setReportKind} />
      ) : null}

      {reportKind ? <ReportSheet open onOpenChange={() => setReportKind(null)} kind={reportKind} /> : null}
    </PageLayout>
  );
}
