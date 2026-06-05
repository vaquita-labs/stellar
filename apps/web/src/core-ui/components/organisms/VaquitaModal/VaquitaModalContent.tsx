'use client';

import { useRestWithdrawal } from '@/core-ui/hooks';
import { isNewDepositHandled } from '@/networks/helpers';
import { parsePoolErrorMessage } from '@/networks/stellar/poolQueries';
import { Button, Spinner, toast } from '@heroui/react';
import { useEffect, useState } from 'react';
import { FiAlertTriangle, FiCalendar, FiCheckCircle } from 'react-icons/fi';
import { useApyByLockPeriod, useTransactions, useWithdrawalTime } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DepositWithdrawalState } from '../../../types';
import { T } from '../../atoms';
import { AppModal } from '../../molecules/AppModal';
import { VaquitaModalContentProps } from './types';
import { getInterestData } from '../../../helpers';

const TimeTile = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-1 min-w-0 flex-col items-center justify-center bg-white border border-black border-b-2 rounded-md py-2">
    <span className="text-2xl font-bold text-black tabular-nums leading-none">
      {value.toString().padStart(2, '0')}
    </span>
    <span className="text-[10px] uppercase text-default-500 tracking-wider mt-1">{label}</span>
  </div>
);

const breakdownTime = (totalSeconds: number) => {
  const safe = Math.max(0, totalSeconds);
  return {
    days: Math.floor(safe / 86400),
    hours: Math.floor((safe % 86400) / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
};

export const VaquitaModalContent = ({ isOpen, onClose, vaquita, isLeaderboard }: VaquitaModalContentProps) => {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { transactionWithdraw } = useTransactions();
  const { confirmWithdrawal } = useRestWithdrawal();
  const { network, token } = useConfigStore();
  const depositLockPeriod = vaquita.lockPeriod;
  const { data: dataApy } = useApyByLockPeriod(depositLockPeriod, token?.symbol ?? '');
  const withdrawalInfo = useWithdrawalTime(vaquita);
  const { vaquitaInterest, protocolInterest: protocolInterestSource, blendInterest, totalInterest } = getInterestData(
    network!,
    dataApy,
    vaquita.amount,
    depositLockPeriod,
  );
  const protocolInterest = protocolInterestSource + blendInterest;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDisabled = !network || !transactionWithdraw;
  const inLockPeriod = vaquita.inLockPeriod;
  const isConfirming = confirming === vaquita.id;
  const withWithdrawButton = !isLeaderboard && vaquita.state === DepositWithdrawalState.DEPOSIT_SUCCESS;
  const withdrawProcessing = vaquita.state === DepositWithdrawalState.WITHDRAW_PROCESSING;
  const time = breakdownTime(withdrawalInfo.timeRemaining);
  const finalAmount = inLockPeriod ? vaquita.amount : vaquita.amount + totalInterest;

  const onWithdraw = async () => {
    if (isDisabled) return;
    setLoading(true);
    let isSuccess = false;
    let lastError: unknown = null;
    if (isNewDepositHandled(network.networkName)) {
      const { success, error } = await transactionWithdraw(
        +vaquita.id,
        vaquita.depositIdHex,
        vaquita.vaquitaContractAddress
      );
      isSuccess = !!success;
      lastError = error ?? null;
    } else {
      const { success, txHash, transaction, error } = await transactionWithdraw(
        +vaquita.id,
        vaquita.depositIdHex,
        vaquita.vaquitaContractAddress
      );
      lastError = error ?? null;
      if (success) {
        await confirmWithdrawal({
          depositId: +vaquita.id,
          txHash: txHash || `${Date.now()}`,
          transactionRaw: JSON.stringify(transaction, (_k, v) =>
            typeof v === 'bigint' ? v.toString() : v
          ),
        });
        isSuccess = !!success;
      }
    }
    if (isSuccess) {
      toast.success(<T>Withdraw sent successfully</T>, {
        description: <T>If you see a vaquita blinking, it is your withdraw that is still being confirmed.</T>,
        timeout: 60000,
      });
      onClose();
    } else {
      const poolMsg = parsePoolErrorMessage(lastError);
      toast.danger(<T>Unsuccessful withdraw</T>, {
        description: poolMsg
          ? <T>{poolMsg}</T>
          : lastError instanceof Error
            ? <T>{lastError.message}</T>
            : undefined,
        timeout: 30000,
      });
    }
    setLoading(false);
  };

  const detailsFooter = (
    <div className="flex w-full gap-2">
      <Button
        onPress={onClose}
        className="flex-1 bg-transparent border border-black border-b-2 text-black rounded-md font-semibold"
        isDisabled={loading}
      >
        {withWithdrawButton ? <T>Cancel</T> : <T>Close</T>}
      </Button>
      {withWithdrawButton && (
        <Button
          onPress={() => setConfirming(vaquita.id)}
          className={
            'flex-1 rounded-md font-bold text-black border border-black border-b-2 ' +
            (inLockPeriod
              ? 'bg-transparent hover:bg-warning-soft'
              : 'bg-success border-[#018222] border-b-5')
          }
          isDisabled={isDisabled}
        >
          <T>Withdraw</T>
        </Button>
      )}
      {withdrawProcessing && (
        <Button
          className="flex-1 rounded-md font-bold text-black border border-black border-b-2 bg-default-100"
          isDisabled
        >
          <Spinner size="sm" color="current" />
          <T>Processing</T>
        </Button>
      )}
    </div>
  );

  const confirmFooter = (
    <div className="flex w-full gap-2">
      <Button
        onPress={() => setConfirming(null)}
        className="flex-1 bg-transparent border border-black border-b-2 text-black rounded-md font-semibold"
        isDisabled={loading}
      >
        <T>Cancel</T>
      </Button>
      <Button
        onPress={onWithdraw}
        className={
          'flex-1 rounded-md font-bold border border-b-5 ' +
          (inLockPeriod
            ? 'bg-danger border-[#7a1620] text-white'
            : 'bg-success border-[#018222] text-black')
        }
        isDisabled={loading}
      >
        {loading ? (
          <>
            <Spinner size="sm" color="current" />
            <T>Processing...</T>
          </>
        ) : inLockPeriod ? (
          <T>Withdraw anyway</T>
        ) : (
          <T>Claim now</T>
        )}
      </Button>
    </div>
  );

  return (
    <AppModal
      open={isOpen}
      onOpenChange={loading ? () => {} : onClose}
      isDismissable={!loading}
      title={isConfirming ? 'Confirm withdrawal' : 'Your vaquita'}
      titleIcon="/icons/bag.svg"
      titleIconAlt="vaquita"
      size="sm"
      bodyClassName="flex flex-col gap-5 pb-6"
      footer={isConfirming ? confirmFooter : detailsFooter}
    >
      {isConfirming ? (
        <div className="flex flex-col gap-4">
          {!inLockPeriod && (
            <div className="flex flex-col items-center gap-2 bg-success-soft border border-success rounded-md p-4 text-center">
              <FiCheckCircle className="w-8 h-8 text-success" />
              <div>
                <p className="font-bold text-black">Time's up!</p>
                <p className="text-sm text-default-600">Your vaquita is ready to claim.</p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 bg-white border border-black border-b-2 rounded-md px-4 py-3">
              <span className="text-xs font-medium text-default-600 uppercase tracking-wide">You will receive</span>
              <span className="text-2xl font-bold text-success tabular-nums break-all leading-tight">
                {finalAmount.toFixed(2)} <span className="text-base">{token?.symbol}</span>
              </span>
            </div>

            {inLockPeriod && (
              <div className="flex flex-col gap-1 bg-white border border-black border-b-2 rounded-md px-4 py-3">
                <span className="text-xs font-medium text-default-600 uppercase tracking-wide">You will lose</span>
                <span className="text-xl font-bold text-danger tabular-nums break-all leading-tight line-through decoration-2">
                  ±{totalInterest.toFixed(2)} <span className="text-base">{token?.symbol}</span>
                </span>
              </div>
            )}
          </div>

          {inLockPeriod ? (
            <div className="flex items-center justify-center gap-1.5 text-xs text-default-600">
              <FiAlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
              <span>
                Early withdrawal — rewards will be{' '}
                <span className="font-semibold text-danger">forfeited</span>
              </span>
            </div>
          ) : (
            <p className="text-sm text-center text-default-600">Confirm to send the transaction.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2 self-start bg-white border border-black border-b-2 rounded-md px-3 py-1.5">
            <FiCalendar className="w-4 h-4 text-black" />
            <span className="text-sm font-semibold text-black">
              {withdrawalInfo.lockPeriodFormatted} lock
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl font-bold text-black tabular-nums">
              {vaquita.amount.toFixed(2)} {token?.symbol}
            </span>
            <span className="text-sm font-semibold text-success tabular-nums">
              +{totalInterest.toFixed(2)} {token?.symbol} est.
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-bold ${inLockPeriod ? 'text-warning' : 'text-success'}`}>
                {inLockPeriod ? 'Locked' : 'Ready to withdraw'}
              </span>
              <span className="text-xs text-default-500 tabular-nums">
                {Math.round(withdrawalInfo.progress)}%
              </span>
            </div>
            <div className="w-full h-4 bg-white border border-black border-b-2 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  inLockPeriod ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, withdrawalInfo.progress))}%` }}
              />
            </div>
            {inLockPeriod && (
              <div className="flex gap-2">
                <TimeTile value={time.days} label="Days" />
                <TimeTile value={time.hours} label="Hours" />
                <TimeTile value={time.minutes} label="Min" />
                <TimeTile value={time.seconds} label="Sec" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 bg-default-50 border border-black/10 rounded-md p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-default-500">Vaquita interest</span>
              <span className="font-semibold text-primary tabular-nums">
                +{vaquitaInterest.toFixed(2)} {token?.symbol}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-default-500">Protocol interest</span>
              <span className="font-semibold text-primary tabular-nums">
                +{protocolInterest.toFixed(2)} {token?.symbol}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs border-t border-black/10 pt-1.5 mt-0.5">
              <span className="font-medium text-black">Total est. earnings</span>
              <span className="font-bold text-success tabular-nums">
                +{totalInterest.toFixed(2)} {token?.symbol}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-default-500">
            <span>Started at</span>
            <span className="tabular-nums">
              {new Date(vaquita.createdTimestamp).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      )}
    </AppModal>
  );
};
