'use client';

import { formatTimeDeposit, getInterestData } from '@/core-ui/helpers';
import { useApyByLockPeriod } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiClock } from 'react-icons/fi';

const formatRemaining = (ms: number, t: TFunction) => {
  if (ms <= 0) return t('home.depositCard.ready', 'Ready');
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  if (days > 0) return t('home.depositCard.remainingDays', '{{days}}d {{hours}}h left', { days, hours });
  if (hours > 0) return t('home.depositCard.remainingHours', '{{hours}}h {{mins}}m left', { hours, mins });
  return t('home.depositCard.remainingMins', '{{mins}}m left', { mins: Math.max(1, mins) });
};

/**
 * Fila compacta de una posición (depósito con lock) en /portafolio, con el mismo
 * lenguaje visual que las filas de /transactions: ícono cuadrado + monto/plazo a
 * la izquierda y ganancia/tiempo a la derecha. Sin badge "Locked" (confundía) ni
 * tarjeta gigante: es una fila de lista, tappable para retirar.
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

  const now =
    deposit.serverTimestamp && deposit.fetchedAtTimestamp
      ? deposit.serverTimestamp + (Date.now() - deposit.fetchedAtTimestamp)
      : Date.now();
  const remainingMs = Math.max(0, deposit.createdTimestamp + deposit.lockPeriod - now);
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
            {formatTimeDeposit(deposit.lockPeriod)} · {formatRemaining(remainingMs, t)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[13px] font-bold tabular-nums text-success">
            +{totalInterest.toFixed(2)} {symbol}
          </p>
          <p className="text-[10px] text-gray-500">{t('portfolio.row.earnings', 'Earnings')}</p>
        </div>

        <FiChevronRight className="h-4 w-4 shrink-0 text-black/40" />
      </button>
    </li>
  );
}
