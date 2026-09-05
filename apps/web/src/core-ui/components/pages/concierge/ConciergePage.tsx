'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiHeadphones, FiMail, FiMessageSquare } from 'react-icons/fi';
import { IconType } from 'react-icons';
import { supportEmail } from '../../../config/featureFlags';
import { PageLayout } from '../../molecules';
import { ReportSheet } from '../../organisms/ReportSheet';
import { FeedbackKind } from '../../../hooks/useSubmitFeedback';

/** Grupo oficial de Telegram: los dos canales en vivo del Concierge son el grupo
 *  y la casilla de soporte (`NEXT_PUBLIC_SUPPORT_EMAIL`). */
const TELEGRAM_URL = 'https://t.me/+uk-ngP7gRZBkNzdh';

const CARD_CLASSES =
  'flex flex-col items-center gap-2 rounded-2xl border border-black border-b-2 bg-white px-4 py-6 text-center transition active:translate-y-[2px] active:border-b hover:bg-[#FFF7E6]';

/**
 * Reemplaza al viejo centro de notificaciones detrás del botón del header: una
 * pantalla de contacto (Concierge) con todas las formas de hablar con el equipo.
 *
 * Dos son canales en vivo (grupo de Telegram, casilla de soporte) y dos son
 * formularios que quedan registrados (feedback y bug). Los formularios viven acá
 * y no en Ajustes → Soporte, que es donde estaban antes como un link al sitio y
 * un "pronto" deshabilitado: el Concierge ya es la pantalla a la que el usuario
 * viene cuando quiere contarnos algo.
 */
export function ConciergePage() {
  const { t } = useTranslation();
  // Qué formulario está abierto. Un solo estado en vez de dos booleanos: no
  // pueden estar abiertos los dos a la vez, y así el sheet se monta una sola vez.
  const [reportKind, setReportKind] = useState<FeedbackKind | null>(null);

  const items: {
    key: string;
    icon: IconType;
    label: string;
    href?: string;
    external?: boolean;
    onPress?: () => void;
  }[] = [
    // El chat vive en el grupo oficial de Telegram.
    { key: 'chat', icon: FiHeadphones, label: t('concierge.chat', 'Chat with us'), href: TELEGRAM_URL, external: true },
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
  ];

  return (
    <PageLayout title={t('concierge.title', 'Concierge')} backHref="/home" contentGap="gap-4">
      <div className="grid grid-cols-2 gap-3">
        {items.map(({ key, icon: Icon, label, href, external, onPress }) =>
          href ? (
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
      {reportKind ? (
        <ReportSheet open onOpenChange={() => setReportKind(null)} kind={reportKind} />
      ) : null}
    </PageLayout>
  );
}
