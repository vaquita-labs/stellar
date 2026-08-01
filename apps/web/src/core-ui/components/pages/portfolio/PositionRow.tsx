'use client';

import { formatTimeDeposit } from '@/core-ui/helpers';
import { useWithdrawalTime } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO, DepositWithdrawalState } from '@/core-ui/types';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiCheck, FiClock } from 'react-icons/fi';

/** Cuánto falta, en grueso (sin segundos, que la lista no tickea): "6d 23h". */
const coarseRemaining = (secs: number) => {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

/**
 * Fila compacta de una posición en /portafolio. Según el estado del depósito
 * cambia el ícono y lo que muestra a la derecha:
 *   - activa (DEPOSIT_SUCCESS): cuánto falta para retirar, o "Listo" si ya venció.
 *   - retirada (WITHDRAW_SUCCESS/EARLY): lo efectivamente ganado; solo lectura.
 *   - con error (DEPOSIT_FAILED/WITHDRAW_FAILED): etiqueta roja; solo lectura.
 * No mostramos una ganancia proyectada en USD: el premio depende de cuánta gente
 * haya en el pool y varía, así que prometer un monto era engañoso; el tiempo que
 * falta es un dato cierto y útil para decidir cuándo retirar.
 */
export function PositionRow({
  deposit,
  onPress,
}: {
  deposit: DepositResponseDTO;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const { token } = useConfigStore();
  const symbol = token?.symbol ?? 'USDC';
  const { canWithdraw, timeRemaining } = useWithdrawalTime(deposit);

  const S = DepositWithdrawalState;
  const isFailed = deposit.state === S.DEPOSIT_FAILED || deposit.state === S.WITHDRAW_FAILED;
  const isWithdrawn = deposit.state === S.WITHDRAW_SUCCESS || deposit.state === S.WITHDRAW_SUCCESS_EARLY;
  const early = deposit.state === S.WITHDRAW_SUCCESS_EARLY;
  // Ganancia realizada (retiradas): lo que efectivamente acreditó el depósito.
  const realizedEarned = deposit.vaquitaInterest + deposit.protocolInterest + deposit.blendInterest;

  const iconStyle = isFailed
    ? 'border-error/40 bg-error/15 text-error'
    : isWithdrawn
      ? 'border-black bg-success/25 text-black'
      : 'border-black bg-primary/30 text-black';

  return (
    <li>
      <button
        type="button"
        onClick={onPress}
        className="w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors cursor-pointer hover:bg-black/5 active:bg-black/10"
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${iconStyle}`}>
          {isFailed ? (
            <FiAlertTriangle className="h-3.5 w-3.5" />
          ) : isWithdrawn ? (
            <FiCheck className="h-3.5 w-3.5" strokeWidth={3} />
          ) : (
            <FiClock className="h-3.5 w-3.5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-black tabular-nums truncate">
            {deposit.amount.toFixed(2)} {symbol}
          </p>
          <p className="text-[11px] text-gray-600 truncate">{formatTimeDeposit(deposit.lockPeriod)}</p>
        </div>

        <div className="shrink-0 text-right">
          {isFailed ? (
            <span className="inline-block rounded-full bg-error/15 px-2 py-0.5 text-[11px] font-bold text-error">
              {t('portfolio.row.error', 'Error')}
            </span>
          ) : isWithdrawn ? (
            <>
              <p className="text-[13px] font-bold tabular-nums text-success">
                +{realizedEarned.toFixed(2)} {symbol}
              </p>
              <p className="text-[10px] text-gray-500">
                {early
                  ? t('portfolio.row.withdrawnEarly', 'Withdrawn early')
                  : t('portfolio.row.withdrawn', 'Withdrawn')}
              </p>
            </>
          ) : canWithdraw ? (
            <span className="inline-block rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold text-success">
              {t('portfolio.row.ready', 'Ready')}
            </span>
          ) : (
            <>
              <p className="text-[13px] font-bold tabular-nums text-black">
                {coarseRemaining(timeRemaining)}
              </p>
              <p className="text-[10px] text-gray-500">{t('portfolio.row.timeLeft', 'left')}</p>
            </>
          )}
        </div>
      </button>
    </li>
  );
}
