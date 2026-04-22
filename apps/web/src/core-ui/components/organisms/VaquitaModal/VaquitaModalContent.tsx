'use client';

import { useRestWithdrawal } from '@/core-ui/hooks';
import { isNewDepositHandled } from '@/networks/helpers';
import {
  addToast,
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Spinner,
} from '@heroui/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { FiCalendar } from 'react-icons/fi';
import { useWithdrawalTime } from '../../../hooks';
import { useNetworkConfigStore, useTransactionStore } from '../../../stores';
import { DepositWithdrawalState } from '../../../types';
import { T } from '../../atoms';
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

  const {vaquitaInterest, aaveInterest, totalInterest} = getInterestData(network!, dataApy, vaquita.amount, lockPeriod);

  // const interestData = getInterestData(dataApy, vaquita.amount, lockPeriod);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const isDisabled = !network || !transactionWithdraw;
  const onWithdraw = async () => {
    if (!isDisabled) {
      setLoading(true);
      let isSuccess = false;
      let lastError: unknown = null;
      if (isNewDepositHandled(network.name)) {
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
            transactionRaw: JSON.stringify(transaction, (key, value) =>
              typeof value === 'bigint' ? value.toString() : value
            ),
          });
          isSuccess = !!success;
        }
      }
      if (isSuccess) {
        addToast({
          title: <T>Withdraw sent successfully</T>,
          description: <T>If you see a vaquita blinking, it is your withdraw that is still being confirmed.</T>,
          color: 'success',
          variant: 'solid',
          timeout: 60000,
        });
        onClose();
      } else {
        addToast({
          title: <T>Unsuccessful withdraw</T>,
          description: lastError instanceof Error ? <T>{lastError.message}</T> : undefined,
          color: 'danger',
          variant: 'solid',
          timeout: 30000,
        });
      }
      setLoading(false);
    }
  };

  const withWithdrawButton = !isLeaderboard && vaquita.state === DepositWithdrawalState.DEPOSIT_SUCCESS;
  const withdrawProcessing = vaquita.state === DepositWithdrawalState.WITHDRAW_PROCESSING;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={loading ? undefined : (open) => !open && onClose()}
      closeButton={
        <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} className="sm:w-10 sm:h-10" />
      }
      size={'sm'}
      classNames={{
        base: 'bg-background text-[#191001] m-0 sm:m-4 border-1 border-black',
      }}
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-2 sm:gap-4">
          <Chip className="text-sm font-medium border-1 rounded-md" color="primary" size="sm">
            <div className="flex items-center gap-1">
              <FiCalendar className=" w-4 h-4" />
              {withdrawalInfo.lockPeriodFormatted} lock
            </div>
          </Chip>
          {/*{vaquita.vaquitaContractAddress !== token?.vaquitaContractAddress && (*/}
          {/*  <Chip className="text-xs font-medium border-1 rounded-md" color="primary" size="sm">*/}
          {/*    <div className="flex items-center gap-1">*/}
          {/*      <FiAlertTriangle className=" w-4 h-4" />*/}
          {/*      <T>Deposit made with an old contract</T>*/}
          {/*    </div>*/}
          {/*  </Chip>*/}
          {/*)}*/}
        </ModalHeader>

        {confirming !== vaquita.id ? (
          <>
            <ModalBody>
              {/* Desktop Layout - Side by side */}
              <div className="grid grid-cols-1 gap-6">
                <div className="">
                  <Popover placement="top">
                    <PopoverTrigger>
                      <div className="flex rounded-xl px-4 pb-4 items-center justify-center">
                        <div className="flex flex-col items-center justify-center">
                          <span className="text-2xl font-medium pr-2">
                            {vaquita.amount} {token?.symbol}
                          </span>
                          <span className="text-md text-success text-xs">{`±${totalInterest.toFixed(4)} ${token?.symbol}`}</span>
                        </div>
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="bg-background rounded-md border-1 border-black">
                      <div className="flex flex-col gap-2 p-2">
                        <span className="text-md font-medium">Rewards</span>

                        <div>
                          <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                              <p className="text-xs text-gray-500">Vaquita Interest: </p>
                              <p className="text-sm font-semibold text-primary">
                                +{vaquitaInterest.toFixed(4)}
                              </p>
                            </div>

                            <div className="flex justify-between items-center">
                              <p className="text-xs text-gray-500">Protocol Interest:{" "}</p>
                              <p className="text-sm font-semibold text-blue-600">
                                +{aaveInterest.toFixed(4)}
                              </p>
                            </div>

                            <div className="flex justify-between items-center border-t border-gray-200 pt-2">
                              <p className="text-xs font-medium text-gray-700">Total earn Est.</p>
                              <p className="text-sm font-bold text-success">
                                +{totalInterest.toFixed(4)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <div className="flex flex-col gap-2 items-center">
                    <div className={`text-sm font-semibold ${vaquita.inLockPeriod ? 'text-warning' : 'text-success'}`}>
                      {vaquita.inLockPeriod ? `${withdrawalInfo.timeRemainingFormatted} left` : 'Ready to withdraw'}
                    </div>
                    <Progress
                      value={withdrawalInfo.progress}
                      className="w-full"
                      color={vaquita.inLockPeriod ? 'warning' : 'success'}
                      size="sm"
                      aria-label="progress"
                    />
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
            </ModalBody>

            <ModalFooter>
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
                      color="primary"
                      size="md"
                      disabled={isDisabled}
                    >
                      <T>Withdraw</T>
                    </Button>
                  )}
                  {withdrawProcessing && (
                    <Button
                      isLoading={withdrawProcessing}
                      spinner={<Spinner size="sm" color="primary" />}
                      className="px-6 py-1 rounded-md text-black transition-all border border-black"
                      variant="ghost"
                      color="primary"
                      size="md"
                    >
                      <T>Processing</T>
                    </Button>
                  )}
                </div>
              </div>
            </ModalFooter>
          </>
        ) : (
          <>
            <ModalBody>
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
            </ModalBody>
            <ModalFooter>
              <div className="flex flex-col items-end  w-full">
                <span className="text-xs text-[#6B5B73] w-full mb-3">Are you sure you want to withdraw?</span>
                <div className="">
                  <div className="flex justify-end gap-1">
                    <Button
                      isLoading={loading}
                      spinner={<Spinner size="sm" color="white" />}
                      className={`flex-1  text-white  rounded-md py-3 px-8 ${
                        vaquita.inLockPeriod ? 'bg-[#F3616F] hover:bg-[#D44A5A]' : 'bg-green-500 hover:bg-green-600'
                      }`}
                      onPress={() => onWithdraw()}
                      size="md"
                    >
                      {loading ? <T>Processing...</T> : <T>Withdraw</T>}
                    </Button>
                    <Button
                      className="flex-1  rounded-md text-[#191001] py-3"
                      onPress={() => setConfirming(null)}
                      disabled={loading}
                      size="md"
                    >
                      <T>Cancel</T>
                    </Button>
                  </div>
                </div>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
