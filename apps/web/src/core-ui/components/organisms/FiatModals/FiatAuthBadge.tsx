'use client';

import { useTranslation } from 'react-i18next';
import { FiCheckCircle } from 'react-icons/fi';

/**
 * Indicador "lindo" de que la autenticación SEP-10 con Anclap funcionó. Muestra
 * un pill verde con check; el JWT crudo queda truncado y discreto (solo
 * referencia), no es el foco visual.
 */
export function FiatAuthBadge({ jwt }: { jwt: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-md border border-[#84E89B] bg-[#E8FBE9] px-3 py-2">
      <FiCheckCircle className="h-5 w-5 shrink-0 text-success" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-black">{t('wallet.fiat.authenticated', 'Connected to Anclap')}</p>
        <p className="truncate font-mono text-[11px] text-gray-500">{jwt}</p>
      </div>
    </div>
  );
}
