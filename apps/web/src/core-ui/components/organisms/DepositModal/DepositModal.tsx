'use client';

import { isNewDepositHandled } from '@/networks/helpers';
import { isTxPendingError } from '@/networks/stellar/pollarError';
import { parsePoolErrorMessage } from '@/networks/stellar/poolQueries';
import { Description, Label, ListBox, Select, Spinner } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck } from 'react-icons/fi';
import { v4 } from 'uuid';
import {
  MONEY_INPUT_DECIMALS,
  formatTimeDeposit,
  formatTokenPrecise,
  getQuickAmounts,
  MIN_USDC,
  truncateDecimals,
} from '../../../helpers';
import { useAnalytics, useInvalidateAfterMoneyMove, useRestDeposit, useTransactions } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { AmountStep } from '../../molecules/AmountStep';
import { AppModal } from '../../molecules/AppModal';
import { ErrorNotice } from '../../molecules/ErrorNotice';
import { ProcessingSteps } from '../../molecules/ProcessingSteps';
import { DepositModalProps } from './types';
import { PressableButton } from '../../molecules/PressableButton';

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
  // Tocó "Available": deposita TODO. El chip prellena el monto redondeado a los
  // decimales que muestra, y depositar ese número dejaría el resto ocioso en la
  // wallet — que es justo lo que el usuario pidió mover. La bandera hace que el
  // submit use el saldo entero en vez del tecleado, igual que el retiro con su
  // sentinel. Se apaga en cuanto vuelve a teclear.
  const [isMax, setIsMax] = useState(false);
  const { token, lockPeriod, setLockPeriod, walletAddress, network } = useConfigStore();
  const { getNextNonce, createDeposit, confirmDeposit, failDeposit } = useRestDeposit();
  const { transactionDeposit } = useTransactions();
  const { trackUserAction, trackConversion, trackError } = useAnalytics();
  const invalidateAfterMoneyMove = useInvalidateAfterMoneyMove();
  // form → processing → success. Failing goes back to the form with the error
  // under it, so the user can retry without re-typing the amount.
  const [phase, setPhase] = useState<'form' | 'processing' | 'success'>('form');
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const txPending = isTxPendingError(error);
  const genericError = t('withdraw.error.generic', 'Something went wrong');
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
  // Mínimo 1 USDC para depositar (mismo piso que valida el backend).
  const isDisabled =
    !amount ||
    amount === '' ||
    isNaN(amountNum) ||
    amountNum < MIN_USDC ||
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
  // Every open starts clean: the last deposit's success or error is not news.
  // Adjusted while rendering rather than in an effect, so the stale screen is
  // never painted for a frame.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPhase('form');
      setError(null);
    }
  }
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

    setIsDepositing(true);
    setError(null);
    setPhase('processing');
    setActiveStep('preparing');

    trackUserAction('deposit_attempted', {
      amount,
      token: token?.symbol,
      lockPeriod,
      network: network?.networkName,
    });

    // Everything that can fail lives inside the try: a throw outside it used to
    // leave the sheet spinning forever with no way to retry.
    try {
      if (isNewDepositHandled(network?.networkName)) {
        setActiveStep('sending');
        const { success, error } = await transactionDeposit('0', amount, lockPeriod);
        if (!success) throw error ?? new Error(genericError);
      } else {
        // Per-wallet nonce → the pool derives the position id as sha256(caller || nonce).
        const nonce = await getNextNonce();
        if (!nonce) throw new Error(genericError);
        const newDeposit = await createDeposit({
          amount,
          tokenSymbol: token.symbol,
          lockPeriod,
          vaquitaContract: token?.vaquitaContractAddress,
          nonce,
        });
        if (!newDeposit.success) throw new Error(genericError);

        setActiveStep('sending');
        const { success, txHash, transaction, depositIdHex, error } = await transactionDeposit(
          nonce,
          amount,
          lockPeriod,
        );
        if (!success) {
          // A transaction still confirming is not a failure: it may land, so the
          // row stays processing instead of being marked failed under it.
          if (!isTxPendingError(error)) {
            await failDeposit({
              id: newDeposit.id,
              txHash: txHash || 'fail_' + v4(),
              depositIdHex,
              transactionRaw: JSON.stringify({ transaction, error }, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value,
              ),
            }).catch(() => undefined);
          }
          throw error ?? new Error(genericError);
        }

        setActiveStep('confirming');
        // The money is already locked on chain here; a refused confirm only
        // delays the row, so it does not turn the deposit into an error.
        await confirmDeposit({
          id: newDeposit.id,
          txHash,
          depositIdHex,
          transactionRaw: JSON.stringify(transaction, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value,
          ),
        }).catch(() => undefined);
      }

      trackConversion('deposit_successful', amount, token?.symbol);
      trackUserAction('deposit_completed', {
        amount,
        token: token?.symbol,
        lockPeriod,
        network: network?.networkName,
      });
      void invalidateAfterMoneyMove();
      setPhase('success');
    } catch (e) {
      trackError('deposit_failed', {
        amount,
        token: token?.symbol,
        lockPeriod,
        network: network?.networkName,
      });
      const poolMsg = parsePoolErrorMessage(e);
      setError(poolMsg && !isTxPendingError(e) ? new Error(poolMsg) : (e ?? new Error(genericError)));
      setPhase('form');
    } finally {
      setIsDepositing(false);
      setActiveStep(null);
    }
  };

  const depositSteps = [
    { key: 'preparing', label: t('deposit.modal.steps.preparing', 'Preparing your deposit') },
    { key: 'sending', label: t('deposit.modal.steps.sending', 'Sending it to the network') },
    { key: 'confirming', label: t('deposit.modal.steps.confirming', 'Confirming your deposit') },
  ];

  const successStep = (
    <div className="flex flex-col items-center justify-center gap-4 py-10">
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="flex items-center justify-center w-20 h-20 rounded-full bg-success border border-black border-b-4"
      >
        <FiCheck className="w-10 h-10 text-black" strokeWidth={3} />
      </motion.div>
      <p className="text-lg font-bold text-black">{t('deposit.toast.successTitle', 'Deposit successful!')}</p>
      <p className="text-sm text-gray-500 text-center">
        {t(
          'deposit.toast.successDescription',
          'Your savings are on their way! This may take a few seconds. Everything will be ready in a moment.',
        )}
      </p>
    </div>
  );

  const footer =
    phase === 'processing' ? (
      <p className="w-full text-center text-xs text-gray-500">
        {t('deposit.modal.processingHint', "This may take up to a minute. Please don't close the app.")}
      </p>
    ) : phase === 'success' ? (
      <PressableButton variant="success" size="cta" onClick={onOpenChange}>
        {t('common.done', 'Done')}
      </PressableButton>
    ) : txPending ? (
      // Con la transacción en vuelo el único botón honesto es cerrar: reintentar
      // mandaría un segundo depósito mientras el primero todavía puede entrar.
      <PressableButton variant="white" size="cta" onClick={onOpenChange}>
        {t('common.close', 'Close')}
      </PressableButton>
    ) : (
      <PressableButton
        variant="success"
        size="cta"
        onClick={() => handleDeposit(isMax ? balanceFormatted : Number(amount))}
        disabled={isDisabled || isDepositing}
      >
        {isDepositing ? (
          <>
            <Spinner size="sm" color="current" /> {t('deposit.processing', 'Processing...')}
          </>
        ) : error ? (
          t('common.retry', 'Retry')
        ) : (
          t('deposit.modal.title', 'Deposit')
        )}
      </PressableButton>
    );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      // Los flujos de plata no se cierran tocando afuera en ningún paso (ver
      // WithdrawModal): sólo la X.
      isDismissable={false}
      title={t('deposit.modal.title', 'Deposit')}
      titleIcon="/icons/bag.svg"
      titleIconAlt="deposit"
      size="md"
      bodyClassName="flex flex-col gap-4 pb-6"
      // Mientras la plata está en vuelo no hay X: cerrar a mitad de camino es lo
      // que hace creer que el depósito falló o no se registró.
      hideClose={phase === 'processing'}
      footer={footer}
    >
      {phase === 'processing' ? (
        <ProcessingSteps steps={depositSteps} activeKey={activeStep} />
      ) : phase === 'success' ? (
        successStep
      ) : (
        <>
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
            {/* En el tutorial el monto viene puesto: sin chips, sin saldo y sin
                mínimo, que ahí no hay nada que decidir ni que corregir. */}
            <AmountStep
              value={amount}
              onValueChange={(next) => {
                setAmount(next);
                setIsMax(false);
              }}
              decimals={MONEY_INPUT_DECIMALS}
              onMax={() => setIsMax(true)}
              disabled={simulate || isDepositing}
              available={simulate ? null : balanceFormatted}
              availableLoading={balanceIsLoading}
              presets={simulate ? undefined : quickAmounts}
              // El mínimo se dice antes de que el botón se apague: un CTA muerto
              // sin explicación es lo que se quiere evitar.
              hint={
                simulate
                  ? undefined
                  : t('deposit.receive.minDeposit', 'Minimum deposit: {{amount}} USDC.', {
                      amount: formatTokenPrecise(MIN_USDC, 2),
                    })
              }
            />
            {!simulate && (
              <Link
                href="/profile/wallet?bridge=1"
                className="text-center text-xs font-semibold text-black underline underline-offset-2"
                onClick={onOpenChange}
              >
                {t('wallet.bridge.depositHelper', 'Need Stellar USDC? Bridge from Base or Ethereum')}
              </Link>
            )}
            {!simulate && (
              <Link
                href="/profile/wallet?onramp=1"
                className="text-center text-xs font-semibold text-black underline underline-offset-2"
                onClick={onOpenChange}
              >
                {t('wallet.fiat.receive.depositHelper', 'Only have Argentine pesos? Deposit with ARS')}
              </Link>
            )}
          </div>
          {error ? <ErrorNotice error={error} /> : null}
        </>
      )}
    </AppModal>
  );
}
