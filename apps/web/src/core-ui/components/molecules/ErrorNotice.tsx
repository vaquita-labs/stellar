'use client';

import { humanizeTxError } from '@/core-ui/helpers/txError';
import { useCryptoMode } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { stellarExpertTxUrl } from '@/networks/stellar/helpers';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiClock } from 'react-icons/fi';

/**
 * Muestra un error de transacción de forma compacta y amable: una sola frase
 * legible y accionable (via humanizeTxError). No expone el texto crudo ni botón
 * de copiar: esto es lo que ve el usuario final, así que el detalle técnico va a
 * consola/telemetría, no a la UI.
 *
 * El caso pendiente —la transacción salió a la red y todavía puede confirmar—
 * no es un fallo: se pinta en tono de espera. Quien renderice este aviso debe
 * además esconder su botón de reintento en ese estado; reintentar mandaría la
 * misma plata dos veces.
 *
 * El link al explorador sale sólo con "Sé de cripto" prendido: al resto, un
 * explorador de bloques no le dice nada y le mete jerga en el peor momento. La
 * frase de arriba tiene que bastar sola, porque para la mayoría es todo lo que
 * hay.
 */
export function ErrorNotice({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const { network } = useConfigStore();
  const cryptoMode = useCryptoMode();
  const { title, pending, hash } = humanizeTxError(error, t);

  const Icon = pending ? FiClock : FiAlertTriangle;
  const tone = pending
    ? 'border-black/20 bg-black/5 text-black'
    : 'border-error/30 bg-error/5 text-error';

  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-left ${tone}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {cryptoMode && hash ? (
          <a
            href={stellarExpertTxUrl(hash, network?.type)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs font-semibold underline"
          >
            {t('transactions.details.viewOnExplorer', 'View on explorer')}
          </a>
        ) : null}
      </div>
    </div>
  );
}
