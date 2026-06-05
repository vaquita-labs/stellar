'use client';

import { isNewDepositHandled } from '@/networks/helpers';
import { parsePoolErrorMessage } from '@/networks/stellar/poolQueries';
import {
  Button,
  Description,
  Label,
  ListBox,
  Select,
  Spinner,
  toast,
} from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useState } from 'react';
import { v4 } from 'uuid';
import { formatTimeDeposit, getQuickAmounts, truncateDecimals } from '../../../helpers';
import { useAnalytics, useRestDeposit, useTransactions } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { T } from '../../atoms';
import { AppModal } from '../../molecules/AppModal';
import { MoneyInput } from '../../molecules/MoneyInput/MoneyInput';
import { TokenSymbol } from '../../molecules/MoneyInput/types';
import { TestnetUSDCNotice } from '../TestnetUSDCNotice';
import { DepositModalProps } from './types';

export function DepositModal({ open, onOpenChange, isDepositing, setIsDepositing }: DepositModalProps) {
  const [mounted, setMounted] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const { token, lockPeriod, setLockPeriod, walletAddress, setToken, network } = useConfigStore();
  const { createDeposit, confirmDeposit, failDeposit } = useRestDeposit();
  const { transactionDeposit } = useTransactions();
  const { trackUserAction, trackConversion, trackError } = useAnalytics();
  const lockTimeOptions =
    token?.lockPeriods.map((lockPeriod) => ({
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

  const { walletBalance, refreshWalletBalance } = usePollar();
  const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];
  // Pollar already returns balances in human units (decimal strings), so no 10**decimals scaling.
  // Match the native asset by Pollar's `type` (it's always reported as XLM) and other assets by
  // code — which requires the config token `symbol` to equal the on-chain Stellar asset code.
  const tokenBalance = balances.find((b) =>
    token?.isNative ? b.type === 'native' : b.code.toUpperCase() === token?.symbol?.toUpperCase(),
  );
  const balanceFormatted = tokenBalance ? truncateDecimals(Number(tokenBalance.available), 5) : 0;
  const balanceIsLoading = walletBalance.step === 'loading';
  const quickAmounts = getQuickAmounts(token?.symbol ?? '');

  useEffect(() => {
    setAmount('');
  }, [token?.symbol]);
  useEffect(() => {
    if (open && walletAddress) void refreshWalletBalance();
  }, [open, walletAddress, refreshWalletBalance]);
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
        network: network?.networkName,
      });

      let isSuccess = false;
      if (isNewDepositHandled(network?.networkName)) {
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
          network: network?.networkName,
        });
        toast.success(<T>Deposit sent successfully</T>, {
          description: <T>If you see a vaquita blinking, it is your deposit that is still being confirmed.</T>,
          timeout: 6000,
        });
        onOpenChange();
      } else {
        // Track failed conversion
        trackError('deposit_failed', {
          amount,
          token: token?.symbol,
          lockPeriod,
          network: network?.networkName,
        });
        const poolMsg = parsePoolErrorMessage(lastError);
        toast.danger(<T>Unsuccessful deposit</T>, {
          description: poolMsg
            ? <T>{poolMsg}</T>
            : lastError instanceof Error
              ? <T>{lastError.message}</T>
              : undefined,
          timeout: 3000,
        });
      }
      setIsDepositing(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      isDismissable={!balanceIsLoading && !isDepositing}
      title="Deposit"
      titleIcon="/icons/bag.svg"
      titleIconAlt="deposit"
      size="md"
      bodyClassName="flex flex-col gap-4 pb-6"
      footer={
        <Button
          onPress={() => handleDeposit(Number(amount))}
          className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md text-black"
          isDisabled={isDisabled || isDepositing}
        >
          {isDepositing ? <><Spinner size="sm" color="current" /> Processing...</> : 'Deposit'}
        </Button>
      }
    >
          {!!network && !!token && (
            <TestnetUSDCNotice networkName={network.networkName} tokenContract={token.contractAddress} />
          )}
          <Select
            isRequired
            value={lockPeriod.toString()}
            onChange={(value) => { if (value) setLockPeriod(parseInt(value as string)); }}
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
                  <ListBox.Item key={option.key.toString()} id={option.key.toString()} textValue={option.label}>
                    <span className="font-semibold text-black">{option.label}</span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
            <Description className="text-default-500 text-xs">The funds will be lock in the vault during the selected period.</Description>
          </Select>

          <div className="flex flex-col gap-2">
            <MoneyInput
              balanceFormatted={balanceFormatted.toString()}
              tokenSymbol={token?.symbol as TokenSymbol}
              value={amount}
              onValueChange={(v) => setAmount(v)}
              onTokenChange={(t) => setToken(t)}
              onReloadBalance={refreshWalletBalance}
              loading={isDepositing}
              balanceIsLoading={balanceIsLoading}
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
