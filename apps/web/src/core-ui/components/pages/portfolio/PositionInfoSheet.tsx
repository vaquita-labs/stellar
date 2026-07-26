'use client';

import { formatTimeDeposit } from '@/core-ui/helpers';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO, DepositWithdrawalState } from '@/core-ui/types';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

/** Fila etiqueta/valor del detalle. */
const InfoRow = ({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) => (
  <div className="flex items-center justify-between gap-3 py-2.5">
    <span className="text-gray-500">{label}</span>
    <span className={`font-bold tabular-nums text-black ${valueClass ?? ''}`}>{value}</span>
  </div>
);

/**
 * Detalle de SOLO LECTURA de una posición retirada o con error. No ofrece
 * acciones (el retiro ya no aplica): solo muestra qué pasó — monto, plazo, lo
 * ganado (retiradas) y las fechas. Las activas usan `PositionWithdrawSheet`.
 */
export function PositionInfoSheet({
  deposit,
  open,
  onOpenChange,
}: {
  deposit: DepositResponseDTO | null;
  open: boolean;
  onOpenChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { token } = useConfigStore();
  const symbol = token?.symbol ?? 'USDC';

  const S = DepositWithdrawalState;
  const isFailed = deposit?.state === S.DEPOSIT_FAILED || deposit?.state === S.WITHDRAW_FAILED;
  const early = deposit?.state === S.WITHDRAW_SUCCESS_EARLY;
  const earned = deposit
    ? deposit.vaquitaInterest + deposit.protocolInterest + deposit.blendInterest
    : 0;
  const withdrawal = deposit?.withdrawals?.[0];
  const withdrawnAt = withdrawal?.confirmedTimestamp || withdrawal?.createdTimestamp || null;

  const fmtDate = (ts?: number | null) =>
    ts
      ? new Date(ts).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

  const statusLabel = isFailed
    ? t('portfolio.filters.statuses.failed', 'With error')
    : early
      ? t('portfolio.row.withdrawnEarly', 'Withdrawn early')
      : t('portfolio.filters.statuses.withdrawn', 'Withdrawn');

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={formatTimeDeposit(deposit?.lockPeriod ?? 0)}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-2"
      footer={
        <PressableButton variant="white" size="cta" className="py-2.5!" onClick={onOpenChange}>
          {t('common.done', 'Done')}
        </PressableButton>
      }
    >
      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-3xl font-bold text-black tabular-nums">
          {(deposit?.amount ?? 0).toFixed(2)} <span className="text-xl font-semibold">{symbol}</span>
        </p>
        <span
          className={
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ' +
            (isFailed ? 'bg-error/15 text-error' : 'bg-success/15 text-success')
          }
        >
          {isFailed ? <FiAlertTriangle className="h-3.5 w-3.5" /> : <FiCheckCircle className="h-3.5 w-3.5" />}
          {statusLabel}
        </span>
      </div>

      {isFailed ? (
        <p className="rounded-lg bg-error/10 px-3.5 py-2.5 text-center text-sm text-error">
          {t('portfolio.info.failedNote', 'This operation did not complete. No funds are locked here.')}
        </p>
      ) : null}

      <div className="divide-y divide-black/10 text-sm">
        <InfoRow label={t('portfolio.info.term', 'Term')} value={formatTimeDeposit(deposit?.lockPeriod ?? 0)} />
        {!isFailed ? (
          <InfoRow
            label={t('portfolio.info.earned', 'Earned')}
            value={`+${earned.toFixed(2)} ${symbol}`}
            valueClass="text-success"
          />
        ) : null}
        <InfoRow label={t('portfolio.info.opened', 'Opened')} value={fmtDate(deposit?.createdTimestamp)} />
        {!isFailed ? (
          <InfoRow label={t('portfolio.info.withdrawnOn', 'Withdrawn on')} value={fmtDate(withdrawnAt)} />
        ) : null}
      </div>
    </AppModal>
  );
}
