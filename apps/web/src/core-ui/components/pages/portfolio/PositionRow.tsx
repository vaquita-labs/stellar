'use client';

import { formatTimeDeposit, getInterestData } from '@/core-ui/helpers';
import { useApyByLockPeriod } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import { useTranslation } from 'react-i18next';
import { FiClock } from 'react-icons/fi';

/**
 * Fila compacta de una posición (depósito con lock) en /portafolio, con el mismo
 * lenguaje visual que las filas de /transactions: ícono cuadrado + monto/plazo a
 * la izquierda y ganancia a la derecha. Sin badge "Locked" (confundía) ni tarjeta
 * gigante: es una fila de lista, tappable para retirar. El tiempo restante no se
 * muestra acá (era ruido): vive en el detalle de la posición.
 */
export function PositionRow({
  deposit,
  onPress,
}: {
  deposit: DepositResponseDTO;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const { network, token } = useConfigStore();
  const { data: dataApy } = useApyByLockPeriod(deposit.lockPeriod, token?.symbol ?? '');
  const { totalInterest } = getInterestData(network!, dataApy, deposit.amount, deposit.lockPeriod);
  const symbol = token?.symbol ?? 'USDC';

  return (
    <li>
      <button
        type="button"
        onClick={onPress}
        className="w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors cursor-pointer hover:bg-black/5 active:bg-black/10"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black bg-primary/30 text-black">
          <FiClock className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-black tabular-nums truncate">
            {deposit.amount.toFixed(2)} {symbol}
          </p>
          <p className="text-[11px] text-gray-600 truncate">
            {formatTimeDeposit(deposit.lockPeriod)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[13px] font-bold tabular-nums text-success">
            +{totalInterest.toFixed(2)} {symbol}
          </p>
          <p className="text-[10px] text-gray-500">{t('portfolio.row.earnings', 'Earnings')}</p>
        </div>
      </button>
    </li>
  );
}
