'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaWhatsapp } from 'react-icons/fa';
import { FiAlertTriangle, FiHeadphones, FiMail, FiMessageSquare, FiTrendingUp } from 'react-icons/fi';
import { IconType } from 'react-icons';
import { supportEmail } from '../../../config/featureFlags';
import { PageLayout } from '../../molecules';
import { FeedbackBoardSheet } from '../../organisms/FeedbackBoard';
import { ReportSheet } from '../../organisms/ReportSheet';
import { FeedbackKind } from '../../../hooks/useSubmitFeedback';

/** Invite link to the community WhatsApp group. */
const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/Gke3pHEdVLT6WsUi8kV3cD?mode=gi_t';

const CARD_CLASSES =
  'flex flex-col items-center gap-2 rounded-2xl border border-black border-b-2 bg-white px-4 py-6 text-center transition active:translate-y-[2px] active:border-b hover:bg-[#FFF7E6]';

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

  const items: {
    key: string;
    icon: IconType;
    label: string;
    href?: string;
    external?: boolean;
    onPress?: () => void;
  }[] = [
    { key: 'chat', icon: FiHeadphones, label: t('concierge.chat', 'Chat with us'), href: '/concierge/chat' },
    {
      key: 'whatsapp',
      icon: FaWhatsapp,
      label: t('concierge.whatsapp', 'Join the WhatsApp group'),
      href: WHATSAPP_GROUP_URL,
      external: true,
    },
    // Abre el cliente de correo del dispositivo contra la casilla de soporte.
    { key: 'email', icon: FiMail, label: t('concierge.email', 'Email'), href: `mailto:${supportEmail()}` },
    {
      key: 'feedback',
      icon: FiMessageSquare,
      label: t('concierge.feedback', 'Send feedback'),
      onPress: () => setReportKind('feedback'),
    },
    {
      key: 'bug',
      icon: FiAlertTriangle,
      label: t('concierge.bug', 'Report a bug'),
      onPress: () => setReportKind('bug'),
    },
    {
      key: 'board',
      icon: FiTrendingUp,
      label: t('concierge.board', 'See what others asked'),
      onPress: () => setBoardKind('bug'),
    },
  ];

  return (
    <PageLayout title={t('concierge.title', 'Help Center')} backHref="/home" contentGap="gap-4">
      <div className="grid grid-cols-2 gap-3">
        {items.map(({ key, icon: Icon, label, href, external, onPress }) =>
          href?.startsWith('/') ? (
            <Link key={key} href={href} className={CARD_CLASSES}>
              <Icon className="h-6 w-6 text-black" />
              <span className="text-sm font-bold text-black">{label}</span>
            </Link>
          ) : href ? (
            <a
              key={key}
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className={CARD_CLASSES}
            >
              <Icon className="h-6 w-6 text-black" />
              <span className="text-sm font-bold text-black">{label}</span>
            </a>
          ) : (
            <button key={key} type="button" onClick={onPress} className={CARD_CLASSES}>
              <Icon className="h-6 w-6 text-black" />
              <span className="text-sm font-bold text-black">{label}</span>
            </button>
          ),
        )}
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
