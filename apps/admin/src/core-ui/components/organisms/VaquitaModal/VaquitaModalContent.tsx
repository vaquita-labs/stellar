'use client';

import { useRestWithdrawal } from '@/core-ui/hooks';
import { isNewDepositHandled } from '@/networks/helpers';
import { Button, Spinner, toast } from '@heroui/react';
import { useState } from 'react';
import { FiCalendar } from 'react-icons/fi';
import { useWithdrawalTime } from '../../../hooks';
import { useNetworkConfigStore, useTransactionStore } from '../../../stores';
import { DepositWithdrawalState } from '../../../types';
import { T } from '../../atoms';
import { AppModal } from '../../molecules/AppModal';
import { VaquitaModalContentProps } from './types';
import { useApyByLockPeriod } from '../../../hooks';
import { getInterestData } from '../../../helpers';

export const VaquitaModalContent = ({ isOpen, onClose, vaquita, isLeaderboard }: VaquitaModalContentProps) => {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { transactionWithdraw } = useTransactionStore();
  const { confirmWithdrawal } = useRestWithdrawal();
  const { network, lockPeriod, token } = useNetworkConfigStore();
  const { data: dataApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');

  const withdrawalInfo = useWithdrawalTime(vaquita);

  const { vaquitaInterest, aaveInterest, blendInterest, totalInterest } = getInterestData(
    network!,
    dataApy,
    vaquita.amount,
    lockPeriod
  );
  const protocolInterest = aaveInterest + blendInterest;

  const isDisabled = !network || !transactionWithdraw;
  const isConfirming = confirming === vaquita.id;
  const onWithdraw = async () => {
    if (!isDisabled) {
      setLoading(true);
      let isSuccess = false;
      if (isNewDepositHandled(network.name)) {
        const { success } = await transactionWithdraw(
          +vaquita.id,
          vaquita.depositIdHex,
          vaquita.vaquitaContractAddress
        );
        isSuccess = !!success;
      } else {
        const { success, txHash, transaction } = await transactionWithdraw(
          +vaquita.id,
          vaquita.depositIdHex,
          vaquita.vaquitaContractAddress
        );
        if (success) {
          await confirmWithdrawal({
            depositId: +vaquita.id,
            txHash: txHash || `${Date.now()}`,
            transactionRaw: JSON.stringify(transaction, (key, value) =>
              typeof value === 'bigint' ? value.toString() : value
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
        toast.danger(<T>Unsuccessful withdraw</T>, {
          timeout: 30000,
        });
      }
      setLoading(false);
    }
  };

  const withWithdrawButton = !isLeaderboard && vaquita.state === DepositWithdrawalState.DEPOSIT_SUCCESS;
  const withdrawProcessing = vaquita.state === DepositWithdrawalState.WITHDRAW_PROCESSING;

  const detailsFooter = (
    <div className="w-full">
      <div className="flex justify-end gap-1">
        <Button onPress={onClose} className="px-4 py-3 rounded-md" size="md">
          {withWithdrawButton ? <T>Cancel</T> : <T>Close</T>}
        </Button>
        {withWithdrawButton && (
          <Button
            onPress={() => setConfirming(vaquita.id)}
            className="px-6 py-1 rounded-md text-black transition-all border border-black tex"
            variant="ghost"
            size="md"
            isDisabled={isDisabled}
          >
            <T>Withdraw</T>
          </Button>
        )}
        {withdrawProcessing && (
          <Button
            className="px-6 py-1 rounded-md text-black transition-all border border-black"
            variant="ghost"
            size="md"
            isDisabled
          >
            <Spinner size="sm" color="current" />
            <T>Processing</T>
          </Button>
        )}
      </div>
    </div>
  );

  const confirmFooter = (
    <div className="flex flex-col items-end  w-full">
      <span className="text-xs text-[#6B5B73] w-full mb-3">Are you sure you want to withdraw?</span>
      <div className="">
        <div className="flex justify-end gap-1">
          <Button
            className={`flex-1  text-white  rounded-md py-3 px-8 ${
              vaquita.inLockPeriod ? 'bg-[#F3616F] hover:bg-[#D44A5A]' : 'bg-green-500 hover:bg-green-600'
            }`}
            onPress={() => onWithdraw()}
            size="md"
            isDisabled={loading}
          >
            {loading ? (
              <>
                <Spinner size="sm" color="current" />
                <T>Processing...</T>
              </>
            ) : (
              <T>Withdraw</T>
            )}
          </Button>
          <Button
            className="flex-1  rounded-md text-[#191001] py-3"
            onPress={() => setConfirming(null)}
            isDisabled={loading}
            size="md"
          >
            <T>Cancel</T>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <AppModal
      open={isOpen}
      onOpenChange={loading ? () => {} : onClose}
      isDismissable={!loading}
      title={
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-sm font-medium border border-black rounded-md px-2 py-0.5">
            <FiCalendar className="w-4 h-4" />
            {withdrawalInfo.lockPeriodFormatted} lock
          </span>
        </span>
      }
      size="sm"
      footer={isConfirming ? confirmFooter : detailsFooter}
    >
      {!isConfirming ? (
        <div className="grid grid-cols-1 gap-6">
          <div className="">
            <div className="flex rounded-xl px-4 pb-4 items-center justify-center">
              <div className="flex flex-col items-center justify-center">
                <span className="text-2xl font-medium pr-2">
                  {vaquita.amount} {token?.symbol}
                </span>
                <span className="text-md text-success text-xs">{`±${totalInterest.toFixed(4)} ${token?.symbol}`}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 p-2">
              <span className="text-md font-medium">Rewards</span>
              <div>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-gray-500">Vaquita Interest: </p>
                    <p className="text-sm font-semibold text-primary">+{vaquitaInterest.toFixed(4)}</p>
                  </div>

                  <div className="flex justify-between items-center">
                    <p className="text-xs text-gray-500">Protocol Interest: </p>
                    <p className="text-sm font-semibold text-blue-600">+{protocolInterest.toFixed(4)}</p>
                  </div>

                  <div className="flex justify-between items-center border-t border-gray-200 pt-2">
                    <p className="text-xs font-medium text-gray-700">Total earn Est.</p>
                    <p className="text-sm font-bold text-success">+{totalInterest.toFixed(4)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 items-center">
              <div className={`text-sm font-semibold ${vaquita.inLockPeriod ? 'text-warning' : 'text-success'}`}>
                {vaquita.inLockPeriod ? `${withdrawalInfo.timeRemainingFormatted} left` : 'Ready to withdraw'}
              </div>
              <div className="w-full h-2 bg-white border border-black rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    vaquita.inLockPeriod ? 'bg-warning' : 'bg-success'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, withdrawalInfo.progress))}%` }}
                  aria-label="progress"
                />
              </div>
            </div>
            {/* Time Remaining */}
            <div className="text-xs text-[#6B5B73] mb-2">
              Started at:{' '}
              {new Date(vaquita.createdTimestamp).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 items-center">
          {vaquita.inLockPeriod ? (
            <>
              <span className="text-2xl font-medium pr-2">
                {vaquita.amount} {token?.symbol}
              </span>
              <span className="text-md text-[#F3616F] line-through italic">
                ±{totalInterest.toFixed(4)} {token?.symbol}
              </span>
            </>
          ) : (
            <span className="text-2xl font-medium pr-2 text-success">
              {(vaquita.amount + totalInterest).toFixed(4)} {token?.symbol}
            </span>
          )}
        </div>
      )}
    </AppModal>
  );
};