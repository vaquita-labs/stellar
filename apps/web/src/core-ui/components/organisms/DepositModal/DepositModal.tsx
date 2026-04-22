'use client';

import { isNewDepositHandled } from '@/networks/helpers';
import {
  addToast,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
} from '@heroui/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { v4 } from 'uuid';
import { formatTimeDeposit, getBalance, getQuickAmounts, truncateDecimals } from '../../../helpers';
import { useAnalytics, useBalance, useRestDeposit } from '../../../hooks';
import { useNetworkConfigStore, useTransactionStore } from '../../../stores';
import { T } from '../../atoms';
import { MoneyInput } from '../../molecules/MoneyInput/MoneyInput';
import { TokenSymbol } from '../../molecules/MoneyInput/types';
import { TestnetUSDCNotice } from '../TestnetUSDCNotice';
import { DepositModalProps } from './types';

export function DepositModal({ open, onOpenChange, isDepositing, setIsDepositing }: DepositModalProps) {
  const [mounted, setMounted] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const { token, lockPeriod, setLockPeriod, walletAddress, setToken, network } = useNetworkConfigStore();
  const { createDeposit, confirmDeposit, failDeposit } = useRestDeposit();
  const { transactionDeposit } = useTransactionStore();
  const { trackUserAction, trackConversion, trackError } = useAnalytics();
  const lockTimeOptions =
    token?.lockPeriod.map((lockPeriod) => ({
      key: lockPeriod,
      label: formatTimeDeposit(lockPeriod),
      available: lockPeriod >= 0,
    })) || [];
  const amountNum = Number(amount);
  const isDisabled =
    !amount ||
    amount === '' ||
    amountNum <= 0 ||
    isNaN(amountNum) ||
    !lockPeriod ||
    !network ||
    !token ||
    !transactionDeposit;

  const { data: balances, refetch, isRefetching, isLoading } = useBalance(walletAddress);
  const balance = getBalance(network, token, balances?.balances ?? [])?.balance || 0;
  const balanceFormatted = balance ? truncateDecimals(balance / 10 ** (token?.decimals ?? 0), 5) : 0;
  const quickAmounts = getQuickAmounts(token?.symbol ?? '');

  useEffect(() => {
    setAmount('');
  }, [token?.symbol]);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const handleDeposit = async (amount: number) => {
    if (!isDisabled) {
      setIsDepositing(true);
      let lastError: unknown = null;

      // Track deposit attempt
      trackUserAction('deposit_attempted', {
        amount,
        token: token?.symbol,
        lockPeriod,
        network: network?.name,
      });

      let isSuccess = false;
      if (isNewDepositHandled(network?.name)) {
        onOpenChange();
        const { success, error } = await transactionDeposit(0, amount, lockPeriod);
        isSuccess = !!success;
        lastError = error ?? null;
      } else {
        const newDeposit = await createDeposit({
          amount,
          tokenSymbol: token.symbol,
          lockPeriod,
          vaquitaContract: token?.vaquitaContractAddress,
        });
        if (newDeposit.success) {
          const { success, txHash, transaction, depositIdHex, error } = await transactionDeposit(
            newDeposit.id,
            amount,
            lockPeriod
          );
          lastError = error ?? null;
          if (success) {
            await confirmDeposit({
              id: newDeposit.id,
              txHash,
              depositIdHex,
              transactionRaw: JSON.stringify(transaction, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
              ),
            });
            isSuccess = !!success;
          } else {
            await failDeposit({
              id: newDeposit.id,
              txHash: txHash || 'fail_' + v4(),
              depositIdHex,
              transactionRaw: JSON.stringify({ transaction, error }, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
              ),
            });
          }
        }
      }

      if (isSuccess) {
        // Track successful conversion
        trackConversion('deposit_successful', amount, token?.symbol);
        trackUserAction('deposit_completed', {
          amount,
          token: token?.symbol,
          lockPeriod,
          network: network?.name,
        });

        addToast({
          title: <T>Deposit sent successfully</T>,
          description: <T>If you see a vaquita blinking, it is your deposit that is still being confirmed.</T>,
          color: 'success',
          variant: 'solid',
          timeout: 6000,
        });
        onOpenChange();
      } else {
        // Track failed conversion
        trackError('deposit_failed', {
          amount,
          token: token?.symbol,
          lockPeriod,
          network: network?.name,
        });

        addToast({
          title: <T>Unsuccessful deposit</T>,
          description: lastError instanceof Error ? <T>{lastError.message}</T> : undefined,
          color: 'danger',
          variant: 'solid',
          timeout: 3000,
        });
      }
      setIsDepositing(false);
    }
  };

  return (
    <Modal
      size="md"
      isOpen={open}
      onOpenChange={isLoading ? undefined : onOpenChange}
      closeButton={<Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />}
      scrollBehavior="inside"
      classNames={{
        base: 'max-h-[90vh]',
        body: 'overflow-y-auto',
      }}
    >
      <ModalContent className="bg-background border border-black">
        <ModalHeader className="text-black font-bold text-xl">Deposit</ModalHeader>
        <ModalBody className="py-0 max-h-[60vh] overflow-y-auto">
          {!!network && !!token && (
            <TestnetUSDCNotice networkName={network.name} tokenContract={token.contractAddress} />
          )}
          <div>
            <Select
              label="Lock time"
              isRequired
              selectedKeys={[lockPeriod.toString()]}
              onSelectionChange={(keys) => {
                const selectedKey = Array.from(keys)[0] as string;
                if (selectedKey) {
                  setLockPeriod(parseInt(selectedKey));
                }
              }}
              classNames={{
                trigger: 'bg-white border border-black border-b-2 h-14',
                label: 'text-black font-normal text-sm',
                value: 'text-black font-medium',
                popoverContent: 'bg-white border border-black rounded-md shadow-lg',
                selectorIcon: 'text-black ',
              }}
              description="The funds will be lock in the vault during the selected period."
              disabled={isDepositing}
            >
              {lockTimeOptions?.map((option) => (
                <SelectItem key={option.key} textValue={option.label} isDisabled={!option.available}>
                  <div className="flex justify-between items-center w-full">
                    <div className="flex flex-col">
                      <span className="font-semibold text-black">{option.label}</span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>

          <div className="">
            <div className="">
              <MoneyInput
                balanceFormatted={balanceFormatted.toString()}
                tokenSymbol={token?.symbol as TokenSymbol}
                value={amount}
                onValueChange={(v) => setAmount(v)}
                onTokenChange={(t) => setToken(t)}
                onReloadBalance={refetch}
                loading={isDepositing}
                balanceIsLoading={isRefetching || isLoading}
              />
            </div>
            <div className="flex justify-between gap-1 mb-4">
              {Array.isArray(quickAmounts) &&
                quickAmounts.map((value: number) => (
                  <Button
                    key={value}
                    onPress={
                      isDepositing
                        ? undefined
                        : () => {
                            setAmount(value.toString());
                          }
                    }
                    className={
                      'flex-1 bg-transparent border border-black border-b-2 text-black  rounded-md hover:bg-primary' +
                      (Number(amount) === value ? ' bg-primary' : '')
                    }
                  >
                    {value}
                  </Button>
                ))}
              <Button
                key={'MAX'}
                onPress={isDepositing ? undefined : () => setAmount(balanceFormatted.toString())}
                className="flex-1 bg-transparent border border-black border-b-2 text-black  rounded-md hover:bg-primary"
              >
                MAX
              </Button>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            onPress={() => handleDeposit(Number(amount))}
            className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md"
            isLoading={isDepositing}
            spinner={<Spinner size="sm" color="white" />}
            isDisabled={isDisabled}
          >
            {isDepositing ? 'Processing...' : 'Deposit'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
