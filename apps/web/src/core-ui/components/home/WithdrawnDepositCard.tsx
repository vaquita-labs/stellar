import { formatAmount, formatTimeDeposit } from '@/core-ui/helpers';
import { DepositResponseDTO, DepositWithdrawalState } from '@/core-ui/types';
import { Card } from '@heroui/react';
import { useTranslation } from 'react-i18next';

/**
 * Tarjeta de un depósito ya retirado: distingue retiro a tiempo (ganancias
 * cobradas) de retiro anticipado (recompensas perdidas).
 */
export const WithdrawnDepositCard = ({
  deposit,
  onPress,
}: {
  deposit: DepositResponseDTO;
  onPress?: () => void;
}) => {
  const { t } = useTranslation();
  const isEarly = deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY;
  const earnings =
    (deposit.vaquitaInterest ?? 0) + (deposit.protocolInterest ?? 0) + (deposit.blendInterest ?? 0);

  return (
    <Card
      onClick={onPress}
      className={
        'border border-black border-b-2 rounded-md cursor-pointer active:translate-y-0.5 transition-all ' +
        (isEarly ? 'bg-default-100 hover:bg-default-200' : 'bg-success/15 hover:bg-success/25')
      }
    >
      <Card.Content className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-black leading-tight truncate">
            {formatAmount(deposit.amount, deposit.tokenSymbol)}
          </p>
          <span
            className={
              'shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ' +
              (isEarly ? 'bg-default-500 text-white' : 'bg-success text-white')
            }
          >
            {isEarly ? t('deposit.list.withdrawnEarlyBadge', 'Withdrawn early') : t('deposit.list.withdrawnBadge', 'Withdrawn')}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-0.5">{formatTimeDeposit(deposit.lockPeriod)}</p>
        <div className="mt-1.5 pt-1.5 border-t border-black/10 flex items-center justify-between">
          <span className="text-xs text-gray-600">
            {isEarly ? t('deposit.list.rewardsForfeited', 'Rewards forfeited') : t('deposit.list.earned', 'Earned')}
          </span>
          <span
            className={
              'text-sm font-bold tabular-nums ' + (isEarly ? 'text-default-500 line-through' : 'text-success')
            }
          >
            {isEarly ? '−' : '+'}
            {earnings.toFixed(2)} {deposit.tokenSymbol}
          </span>
        </div>
      </Card.Content>
    </Card>
  );
};
