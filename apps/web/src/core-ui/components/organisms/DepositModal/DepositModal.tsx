'use client';

import { isNewDepositHandled } from '@/networks/helpers';
import { directBlendMainnetSupply } from '@/networks/stellar/blendDirect';
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
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 } from 'uuid';
import { formatTimeDeposit, getQuickAmounts, truncateDecimals } from '../../../helpers';
import { useAnalytics, useRestDeposit, useTransactions } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { MoneyInput } from '../../molecules/MoneyInput/MoneyInput';
import { TokenSymbol } from '../../molecules/MoneyInput/types';
import { DepositModalProps } from './types';

export function DepositModal({
  open,
  onOpenChange,
  isDepositing,
  setIsDepositing,
  simulate = false,
  initialAmount,
  simulateLockMs = 5000,
  onSimulatedSuccess,
}: DepositModalProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [amount, setAmount] = useState<string>('');
  const { token, lockPeriod, setLockPeriod, walletAddress, setToken, network } = useConfigStore();
  const { createDeposit, confirmDeposit, failDeposit } = useRestDeposit();
  const { transactionDeposit } = useTransactions();
  const { trackUserAction, trackConversion, trackError } = useAnalytics();
  // En modo tutorial el lock es local (no toca el config global) y se ofrece una
  // sola opción de pocos segundos; en modo normal salen los lock periods reales.
  const lockTimeOptions = simulate
    ? [{ key: simulateLockMs, label: t('deposit.modal.lockSeconds', '{{count}} seconds', { count: Math.round(simulateLockMs / 1000) }), available: true }]
    : token?.lockPeriods.map((lockPeriod) => ({
        key: lockPeriod,
        label: formatTimeDeposit(lockPeriod),
        available: lockPeriod >= 0,
      })) || [];
  const effectiveLockPeriod = simulate ? simulateLockMs : lockPeriod;
  const amountNum = Number(amount);
  const isDisabled =
    !amount ||
    amount === '' ||
    amountNum <= 0 ||
    isNaN(amountNum) ||
    !effectiveLockPeriod ||
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
  const canDirectBlendDeposit =
    !simulate &&
    network?.type === 'mainnet' &&
    token?.symbol?.toUpperCase() === 'USDC' &&
    !!walletAddress &&
    !!amount &&
    amountNum > 0 &&
    !isNaN(amountNum);

  useEffect(() => {
    setAmount('');
  }, [token?.symbol]);
  // En modo tutorial precargamos el monto de ejemplo al abrir.
  useEffect(() => {
    if (open && initialAmount != null) setAmount(initialAmount);
  }, [open, initialAmount]);
  useEffect(() => {
    if (open && walletAddress) void refreshWalletBalance();
  }, [open, walletAddress, refreshWalletBalance]);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const handleDeposit = async (amount: number) => {
    if (isDisabled) return;

    // Modo tutorial: misma UI, pero sin transacción real. Simulamos una breve
    // confirmación y avisamos al orquestador del tutorial.
    if (simulate) {
      setIsDepositing(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      setIsDepositing(false);
      onOpenChange();
      onSimulatedSuccess?.(amount, effectiveLockPeriod);
      return;
    }

    {
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
        toast.success(t('deposit.toast.successTitle', 'Deposit successful!'), {
          indicator: (
            <Image
              src="/icons/global/coin.png"
              alt=""
              width={30}
              height={30}
              className="drop-shadow-sm"
            />
          ),
          description: t(
            'deposit.toast.successDescription',
            'Your savings are on their way! This may take a few seconds. Everything will be ready in a moment.',
          ),
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
        toast.danger(t('deposit.toast.errorTitle', "Deposit didn't go through"), {
          indicator: <Image src="/vaquita/error.svg" alt="" width={32} height={32} />,
          description: poolMsg
            ? poolMsg
            : lastError instanceof Error
              ? lastError.message
              : undefined,
          timeout: 3000,
        });
      }
      setIsDepositing(false);
    }
  };

  const handleDirectBlendDeposit = async () => {
    if (!canDirectBlendDeposit || !token) return;
    setIsDepositing(true);
    try {
      trackUserAction('direct_blend_deposit_attempted', {
        amount: amountNum,
        token: token.symbol,
        network: network?.networkName,
      });
      const { hash } = await directBlendMainnetSupply({
        address: walletAddress,
        amount,
        decimals: token.decimals,
      });
      trackConversion('direct_blend_deposit_successful', amountNum, token.symbol);
      toast.success(t('deposit.toast.directBlendSuccessTitle', 'Blend deposit submitted'), {
        description: t(
          'deposit.toast.directBlendSuccessDescription',
          'Your USDC was sent directly to Blend. This emergency path is not tracked as a Vaquita lock.',
        ),
        timeout: 6000,
      });
      console.info('[direct-blend-deposit] submitted', { hash });
      onOpenChange();
    } catch (error) {
      trackError('direct_blend_deposit_failed', {
        amount: amountNum,
        token: token?.symbol,
        network: network?.networkName,
      });
      toast.danger(t('deposit.toast.errorTitle', "Deposit didn't go through"), {
        indicator: <Image src="/vaquita/error.svg" alt="" width={32} height={32} />,
        description: error instanceof Error ? error.message : undefined,
        timeout: 5000,
      });
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      isDismissable={!balanceIsLoading && !isDepositing}
      title={t('deposit.modal.title', 'Deposit')}
      titleIcon="/icons/bag.svg"
      titleIconAlt="deposit"
      size="md"
      bodyClassName="flex flex-col gap-4 pb-6"
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button
            onPress={() => handleDeposit(Number(amount))}
            className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md text-black"
            isDisabled={isDisabled || isDepositing}
          >
            {isDepositing ? <><Spinner size="sm" color="current" /> {t('deposit.processing', 'Processing...')}</> : t('deposit.modal.title', 'Deposit')}
          </Button>
          {network?.type === 'mainnet' ? (
            <Button
              onPress={handleDirectBlendDeposit}
              className="w-full rounded-md border border-black border-b-2 bg-white px-4 py-5 font-bold text-black"
              isDisabled={!canDirectBlendDeposit || isDepositing}
            >
              {isDepositing ? <><Spinner size="sm" color="current" /> {t('deposit.processing', 'Processing...')}</> : t('deposit.modal.directBlend', 'Deposit directly to Blend')}
            </Button>
          ) : null}
        </div>
      }
    >
          <Select
            isRequired
            value={effectiveLockPeriod.toString()}
            onChange={(value) => { if (value && !simulate) setLockPeriod(parseInt(value as string)); }}
            disabledKeys={lockTimeOptions.filter((o) => !o.available).map((o) => o.key.toString())}
            isDisabled={isDepositing || simulate}
          >
            <Label className="text-black font-normal text-sm">{t('deposit.modal.lockTime', 'Lock time')}</Label>
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
            <Description className="text-default-500 text-xs">{t('deposit.modal.lockDescription', 'The funds will be lock in the vault during the selected period.')}</Description>
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
              // Tutorial: monto fijo, no se puede editar ni cambiar el token.
              disabled={simulate}
            />
            <div className={`flex justify-between gap-2 ${simulate ? 'hidden' : ''}`}>
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
            {!simulate && (
              <Link
                href="/profile/wallet?bridge=1"
                className="text-center text-xs font-semibold text-black underline underline-offset-2"
                onClick={onOpenChange}
              >
                {t('wallet.bridge.depositHelper', 'Need Stellar USDC? Bridge from Base or Ethereum')}
              </Link>
            )}
          </div>
    </AppModal>
  );
}
