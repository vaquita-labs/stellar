import { formatAmount, formatTimeDeposit, getInterestData } from '@/core-ui/helpers';
import { useApyByLockPeriod } from '@/core-ui/hooks';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import { Card } from '@heroui/react';

const formatRemaining = (ms: number) => {
  if (ms <= 0) return 'Ready';
  const totalMins = Math.floor(ms / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${Math.max(1, mins)}m left`;
};

const formatShortDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const VaquitaDepositCard = ({
  onPress,
  deposit,
}: {
  onPress?: () => void;
  deposit: DepositResponseDTO;
}) => {
  const { network, lockPeriod, token } = useNetworkConfigStore();
  const { data: dataApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');

  const { totalInterest } = getInterestData(
    network!,
    dataApy,
    deposit.amount,
    deposit.lockPeriod
  );

  const now = Date.now();
  const unlockTimestamp = deposit.createdTimestamp + deposit.lockPeriod;
  const elapsed = Math.max(0, now - deposit.createdTimestamp);
  const progress = Math.min(1, deposit.lockPeriod > 0 ? elapsed / deposit.lockPeriod : 1);
  const remainingMs = Math.max(0, unlockTimestamp - now);
  const isLocked = deposit.inLockPeriod;
  const isInteractive = !!onPress;

  const cardClasses = isLocked
    ? 'border border-slate-300 border-b-2 bg-slate-50'
    : 'border border-success/50 border-b-2 bg-success/10';
  const hoverClasses = isInteractive
    ? (isLocked ? 'hover:bg-slate-100' : 'hover:bg-success/20') +
      ' cursor-pointer active:translate-y-0.5 transition-all'
    : '';
  const trackClasses = isLocked ? 'bg-slate-200' : 'bg-success/20';
  const fillClasses = 'bg-success';
  const displayProgress = Math.max(progress, 0.08);

  return (
    <Card className={`${cardClasses} ${hoverClasses} rounded-xl`} onClick={onPress}>
      <Card.Content className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-black leading-tight truncate">
            {formatAmount(deposit.amount, deposit.tokenSymbol)}
          </p>
          {isLocked ? (
            <span className="inline-flex items-center gap-1 shrink-0 bg-slate-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1a4 4 0 0 0-4 4v3H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V5a4 4 0 0 0-4-4Zm2 7V5a2 2 0 1 0-4 0v3h4Z" clipRule="evenodd" />
              </svg>
              Locked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 shrink-0 bg-success text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clipRule="evenodd" />
              </svg>
              Ready
            </span>
          )}
        </div>

        <p className="text-xs text-gray-600 mt-0.5">
          {formatTimeDeposit(deposit.lockPeriod)}
          {isLocked && (
            <>
              {' · '}
              <span className="font-semibold text-slate-700">{formatRemaining(remainingMs)}</span>
            </>
          )}
        </p>

        <div className="mt-2">
          <div className={`relative h-1.5 ${trackClasses} rounded-full overflow-hidden`}>
            <div
              className={`absolute inset-y-0 left-0 ${fillClasses} rounded-full transition-all`}
              style={{ width: `${displayProgress * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Unlocks {formatShortDate(unlockTimestamp)}</p>
        </div>

        <div className="mt-1.5 pt-1.5 border-t border-black/10 flex items-center justify-between">
          <span className="text-xs text-gray-600">Earnings</span>
          <span className="text-sm font-bold text-success">
            +{totalInterest.toFixed(4)} {deposit.tokenSymbol}
          </span>
        </div>
      </Card.Content>
    </Card>
  );
};
