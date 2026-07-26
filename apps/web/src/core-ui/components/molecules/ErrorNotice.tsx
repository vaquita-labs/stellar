'use client';

import { humanizeTxError } from '@/core-ui/helpers/txError';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle } from 'react-icons/fi';

/**
 * Muestra un error de transacción de forma compacta y amable: una sola frase
 * legible y accionable (via humanizeTxError). No expone el texto crudo ni botón
 * de copiar: esto es lo que ve el usuario final, así que el detalle técnico va a
 * consola/telemetría, no a la UI.
 */
export function ErrorNotice({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const { title } = humanizeTxError(error, t);

  return (
    <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/5 p-3 text-left">
      <FiAlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-error" />
      <p className="flex-1 text-sm font-semibold text-error">{title}</p>
    </div>
  );
}
