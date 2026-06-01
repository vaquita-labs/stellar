'use client';

import { isNewDepositHandled } from '@/networks/helpers';
import { Button, Description, Label, ListBox, Select, Spinner } from '@heroui/react';
import { useEffect, useState } from 'react';
import { v4 } from 'uuid';
import { formatTimeDeposit, getBalance, getQuickAmounts, truncateDecimals } from '../../../helpers';
import { useBalance, useRestDeposit } from '../../../hooks';
import { useNetworkConfigStore, useTransactionStore } from '../../../stores';
import { T } from '../../atoms';
import { addDangerToast, addSuccessToast } from '../../molecules';
import { AppModal } from '../../molecules/AppModal';
import { MoneyInput } from '../../molecules/MoneyInput/MoneyInput';
import { TokenSymbol } from '../../molecules/MoneyInput/types';
import { TestnetUSDCNotice } from '../TestnetUSDCNotice';
import { DepositModalProps } from './types';

export function DepositModal({
  open,
  onOpenChange,
  isDepositing,
  setIsDepositing,
}: DepositModalProps) {
  const [amount, setAmount] = useState<string>('');
  const { token, lockPeriod, setLockPeriod, walletAddress, setToken, network } =
    useNetworkConfigStore();
  const { createDeposit, confirmDeposit, failDeposit } = useRestDeposit();
  const { transactionDeposit } = useTransactionStore();
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
  const balanceFormatted = balance
    ? truncateDecimals(balance / 10 ** (token?.decimals ?? 0), 5)
    : 0;
  const quickAmounts = getQuickAmounts(token?.symbol ?? '');

  useEffect(() => {
    setAmount('');
  }, [token?.symbol]);

  const handleDeposit = async (amount: number) => {
    if (!isDisabled) {
      setIsDepositing(true);

      let isSuccess = false;
      if (isNewDepositHandled(network?.name)) {
        onOpenChange();
        const { success } = await transactionDeposit(0, amount, lockPeriod);
        isSuccess = !!success;
      } else {
        const newDeposit = await createDeposit({ amount, tokenSymbol: token.symbol, lockPeriod });
        if (newDeposit.success) {
          const { success, txHash, transaction, depositIdHex, error } = await transactionDeposit(
            newDeposit.id,
            amount,
            lockPeriod
          );
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
        addSuccessToast(
          <T>Deposit sent successfully</T>,
          <T>If you see a vaquita blinking, it is your deposit that is still being confirmed.</T>
        );
        onOpenChange();
      } else {
        addDangerToast(<T>Unsuccessful deposit</T>, null);
      }
      setIsDepositing(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      isDismissable={!isLoading && !isDepositing}
      title="Deposit"
      size="md"
      bodyClassName="flex flex-col gap-4 pb-6"
      footer={
        <Button
          onPress={() => handleDeposit(Number(amount))}
          className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md text-black"
          isDisabled={isDisabled || isDepositing}
        >
          {isDepositing ? (
            <>
              <Spinner size="sm" color="current" /> Processing...
            </>
          ) : (
            'Deposit'
          )}
        </Button>
      }
    >
      {!!network && !!token && (
        <TestnetUSDCNotice networkName={network.name} tokenContract={token.contractAddress} />
      )}
      <Select
        isRequired
        value={lockPeriod.toString()}
        onChange={(value) => {
          if (value) setLockPeriod(parseInt(value as string));
        }}
        disabledKeys={lockTimeOptions.filter((o) => !o.available).map((o) => o.key.toString())}
        isDisabled={isDepositing}
      >
        <Label className="text-black font-normal text-sm">Lock time</Label>
        <Select.Trigger className="bg-white border border-black border-b-2 h-14 items-center">
          <Select.Value className="text-black font-medium" />
          <Select.Indicator className="text-black" />
        </Select.Trigger>
        <Select.Popover className="bg-white border border-black rounded-md shadow-lg">
          <ListBox>
            {lockTimeOptions?.map((option) => (
              <ListBox.Item
                key={option.key.toString()}
                id={option.key.toString()}
                textValue={option.label}
              >
                <span className="font-semibold text-black">{option.label}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        <Description className="text-default-500 text-xs">
          The funds will be lock in the vault during the selected period.
        </Description>
      </Select>

      <div className="flex flex-col gap-2">
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
        <div className="flex justify-between gap-2">
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
                  'flex-1 bg-transparent border border-black border-b-2 text-black rounded-md hover:bg-primary' +
                  (Number(amount) === value ? ' bg-primary' : '')
                }
              >
                {value}
              </Button>
            ))}
          <Button
            key={'MAX'}
            onPress={isDepositing ? undefined : () => setAmount(balanceFormatted.toString())}
            className="flex-1 bg-transparent border border-black border-b-2 text-black rounded-md hover:bg-primary"
          >
            MAX
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
