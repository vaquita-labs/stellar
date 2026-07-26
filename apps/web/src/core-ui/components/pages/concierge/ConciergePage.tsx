'use client';

import { useTranslation } from 'react-i18next';
import { FiHeadphones, FiMail, FiSend } from 'react-icons/fi';
import { PageLayout } from '../../molecules';

/** Grupo oficial de Telegram: único canal de contacto vivo por ahora. El email
 *  todavía no está habilitado, así que su tarjeta va como "Soon" (deshabilitada). */
const TELEGRAM_URL = 'https://t.me/+uk-ngP7gRZBkNzdh';

/** Reemplaza al viejo centro de notificaciones detrás del botón del header:
 *  una pantalla de contacto (Concierge) con los canales para hablar con el
 *  equipo. Chat en vivo = grupo de Telegram; Email = próximamente. */
export function ConciergePage() {
  const { t } = useTranslation();

  return (
    <PageLayout title={t('concierge.title', 'Concierge')} backHref="/home" contentGap="gap-4" contentClassName="flex-1">
      <div className="grid grid-cols-2 gap-3">
        {/* Chat en vivo todavía no habilitado: tarjeta deshabilitada con "Soon". */}
        <div className="relative flex flex-col items-center gap-2 rounded-2xl border border-black border-b-2 bg-white px-4 py-6 text-center opacity-60 cursor-not-allowed">
          <span className="absolute right-2 top-2 rounded-full border border-black border-b-2 bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
            {t('common.soon', 'Soon')}
          </span>
          <FiHeadphones className="h-6 w-6 text-black" />
          <span className="text-sm font-bold text-black">{t('concierge.chat', 'Chat with us')}</span>
        </div>

        {/* Email todavía no habilitado: tarjeta deshabilitada con badge "Soon". */}
        <div className="relative flex flex-col items-center gap-2 rounded-2xl border border-black border-b-2 bg-white px-4 py-6 text-center opacity-60 cursor-not-allowed">
          <span className="absolute right-2 top-2 rounded-full border border-black border-b-2 bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black">
            {t('common.soon', 'Soon')}
          </span>
          <FiMail className="h-6 w-6 text-black" />
          <span className="text-sm font-bold text-black">{t('concierge.email', 'Email')}</span>
        </div>
      </div>

      {/* Banner anclado al footer: unirse al canal oficial de Telegram. */}
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto flex items-center gap-3 rounded-2xl border border-black border-b-2 bg-white px-4 py-3.5 transition active:translate-y-[2px] active:border-b hover:bg-[#FFF7E6]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center text-black">
          <FiSend className="h-5 w-5" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-black">
            {t('concierge.telegramTitle', 'Want to stay in the loop?')}
          </span>
          <span className="text-xs text-gray-600">
            {t('concierge.telegramBody', 'Join our official Telegram channel')}
          </span>
        </div>
      </a>
    </PageLayout>
  );
}
