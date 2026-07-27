'use client';

import { AMOUNT_DECIMALS, floorAmount, formatUsdPrecise, truncatedAmountString } from '@/core-ui/helpers/numbers';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import {
  useApyByLockPeriods,
  useBlendPosition,
  useRestDeposit,
  useTransactions,
} from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { directBlendWithdraw } from '@/networks/stellar/blendDirect';
import { Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, useAnimationControls } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck } from 'react-icons/fi';
import { HiOutlineSelector } from 'react-icons/hi';
import { v4 } from 'uuid';
import { AmountKeypad } from '../../molecules/AmountKeypad';
import { AppModal } from '../../molecules/AppModal';
import { ErrorNotice } from '../../molecules/ErrorNotice';
import { PressableButton } from '../../molecules/PressableButton';

type Step = 'amount' | 'term' | 'processing' | 'success';

function displayAmount(raw: string) {
  if (raw === '') return '$0.00';
  return `$${raw}`;
}

/**
 * "Invertir": crea una posición con lock en el Vaquita pool. Estilo teclado (como
 * el depósito a Blend), con un card presionable para elegir el PLAZO/APY. La plata
 * sale de BLEND (no de la wallet): al confirmar encadena
 *   1) directBlendWithdraw (Blend → wallet, mismo USDC/issuer)
 *   2) el depósito al Vaquita pool (createDeposit → transactionDeposit → confirm)
 */
export function InvestModal({ open, onOpenChange }: { open: boolean; onOpenChange: () => void }) {
  const { t } = useTranslation();
  const { walletAddress, token } = useConfigStore();
  const queryClient = useQueryClient();
  const { data: blendPosition, refetch: refetchBlend } = useBlendPosition(walletAddress);
  const available = floorAmount(blendPosition?.usdc ?? 0, AMOUNT_DECIMALS);

  const lockPeriods = useMemo(
    () => [...(token?.lockPeriods ?? [])].filter((p) => p > 0).sort((a, b) => a - b),
    [token?.lockPeriods],
  );
  const { byLockPeriod } = useApyByLockPeriods(lockPeriods, token?.symbol ?? '');
  const { createDeposit, confirmDeposit, failDeposit } = useRestDeposit();
  const { transactionDeposit } = useTransactions();

  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [selectedLock, setSelectedLock] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overBalance, setOverBalance] = useState(false);
  const [isMax, setIsMax] = useState(false);
  // Salto en curso durante "processing" (para el stepper). 'preparing' = retiro
  // de Blend; 'locking' = depósito al tramo.
  const [activeStep, setActiveStep] = useState<'preparing' | 'locking' | null>(null);
  const amountControls = useAnimationControls();

  useEffect(() => {
    if (open) {
      setStep('amount');
      setAmount('');
      setSelectedLock(lockPeriods[0] ?? null);
      setError(null);
      setOverBalance(false);
      setIsMax(false);
      setActiveStep(null);
    }
  }, [open, lockPeriods]);

  const numericAmount = Number(amount || '0');
  const apyOf = (lp: number) =>
    (byLockPeriod[lp]?.vaquitaApy ?? 0) + (byLockPeriod[lp]?.protocolApy ?? 0);
  const selectedApy = selectedLock != null ? apyOf(selectedLock) : 0;
  const canReview = numericAmount > 0 && selectedLock != null;

  const shakeAmount = () => {
    setOverBalance(true);
    void amountControls.start({
      x: [0, -8, 8, -6, 6, -3, 3, 0],
      transition: { duration: 0.45, ease: 'easeInOut' },
    });
  };

  // Cambiar de plazo con swipe vertical (o rueda) sobre el selector: arriba =
  // siguiente, abajo = anterior, con wrap. El tap abre la lista completa.
  const cycleTerm = (dir: 1 | -1) => {
    if (lockPeriods.length < 2 || selectedLock == null) return;
    const idx = lockPeriods.findIndex((p) => p === selectedLock);
    const base = idx === -1 ? 0 : idx;
    const next = (base + dir + lockPeriods.length) % lockPeriods.length;
    setSelectedLock(lockPeriods[next]);
  };
  const touchStartY = useRef<number | null>(null);
  const swipedRef = useRef(false);

  const handleReview = () => {
    if (numericAmount > available) {
      shakeAmount();
      return;
    }
    void handleConfirm();
  };

  const handleConfirm = async () => {
    if (!token || !walletAddress || selectedLock == null || !transactionDeposit) return;
    setStep('processing');
    setActiveStep('preparing');
    setError(null);
    try {
      // 1) Blend → wallet (mismo USDC/issuer que acepta el Vaquita pool).
      await directBlendWithdraw({
        address: walletAddress,
        amount,
        decimals: token.decimals,
        withdrawAll: isMax,
      });

      // 2) Depósito al Vaquita pool (crea la posición con lock).
      setActiveStep('locking');
      const newDeposit = await createDeposit({
        amount: numericAmount,
        tokenSymbol: token.symbol,
        lockPeriod: selectedLock,
        vaquitaContract: token?.vaquitaContractAddress,
      });
      if (!newDeposit.success) throw new Error(t('withdraw.error.generic', 'Something went wrong'));

      const { success, txHash, transaction, depositIdHex, error: txError } = await transactionDeposit(
        newDeposit.id,
        numericAmount,
        selectedLock,
      );
      const raw = (obj: unknown) =>
        JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      if (success) {
        await confirmDeposit({ id: newDeposit.id, txHash, depositIdHex, transactionRaw: raw(transaction) });
      } else {
        await failDeposit({
          id: newDeposit.id,
          txHash: txHash || 'fail_' + v4(),
          depositIdHex,
          transactionRaw: raw({ transaction, error: txError }),
        });
        throw (txError as Error) ?? new Error(t('withdraw.error.generic', 'Something went wrong'));
      }

      void refetchBlend();
      void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
      void queryClient.invalidateQueries({ queryKey: ['deposit'] });
      setStep('success');
    } catch (e) {
      setError((e as Error)?.message ?? t('withdraw.error.generic', 'Something went wrong'));
      setStep('amount');
    }
  };

  // --- Paso: monto -----------------------------------------------------------
  const amountStep = (
    <div className="flex flex-col gap-2.5">
      <div className="text-center">
        <motion.p
          animate={amountControls}
          className={`text-3xl font-bold ${overBalance || amount === '' ? 'text-gray-400' : 'text-black'}`}
        >
          {displayAmount(amount)}
        </motion.p>
        <button
          type="button"
          onClick={() => {
            setAmount(truncatedAmountString(available));
            setIsMax(true);
            if (overBalance) setOverBalance(false);
          }}
          className="mt-1 inline-flex items-center rounded-full border border-black/15 bg-black/5 px-3 py-1 text-xs font-semibold text-gray-500 transition active:translate-y-0.5 hover:bg-black/10"
        >
          {`${t('withdraw.available', 'Available')}: ${formatUsdPrecise(available)}`}
        </button>
      </div>

      {/* Selector de PLAZO/APY: cambiás con swipe vertical (o rueda), o tap para
          la lista completa. El ⇅ lo sugiere. Texto corto: plazo + APY. */}
      <PressableButton
        variant="white"
        size="row"
        className="touch-pan-x select-none"
        onClick={() => {
          if (swipedRef.current) {
            swipedRef.current = false;
            return;
          }
          setStep('term');
        }}
        onTouchStart={(e) => {
          touchStartY.current = e.touches[0].clientY;
          swipedRef.current = false;
        }}
        onTouchEnd={(e) => {
          if (touchStartY.current === null) return;
          const dy = e.changedTouches[0].clientY - touchStartY.current;
          touchStartY.current = null;
          if (Math.abs(dy) > 30) {
            swipedRef.current = true;
            cycleTerm(dy < 0 ? 1 : -1);
          }
        }}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > 10) cycleTerm(e.deltaY > 0 ? 1 : -1);
        }}
      >
        <span className="flex-1 min-w-0 text-left">
          <span className="block text-sm font-bold text-black truncate">
            {selectedLock != null
              ? formatTimeDeposit(selectedLock)
              : t('invest.selectTerm', 'Select a term')}
          </span>
          <span className="block text-xs font-bold text-success tabular-nums">
            {selectedApy.toFixed(2)}% APR
          </span>
        </span>
        <HiOutlineSelector className="w-5 h-5 text-black shrink-0" />
      </PressableButton>

      <AmountKeypad
        value={amount}
        onValueChange={(next) => {
          setAmount(next);
          setIsMax(false);
          if (overBalance) setOverBalance(false);
        }}
        maxDecimals={AMOUNT_DECIMALS}
        compact
      />

      {error ? <ErrorNotice error={error} /> : null}
    </div>
  );

  // --- Paso: elegir plazo/APY (filas simples, no cards) ----------------------
  const termStep = (
    <div className="flex flex-col">
      {lockPeriods.map((lp, i) => (
        <button
          key={lp}
          type="button"
          onClick={() => {
            setSelectedLock(lp);
            setStep('amount');
          }}
          className={`w-full flex items-center gap-3 px-2 py-3 text-left transition active:bg-black/[0.04] ${
            i > 0 ? 'border-t border-black/10' : ''
          }`}
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-black">{formatTimeDeposit(lp)}</span>
            <span className="block text-xs font-bold text-success tabular-nums">
              {apyOf(lp).toFixed(2)}% APR
            </span>
          </span>
          {selectedLock === lp ? <FiCheck className="w-5 h-5 text-success shrink-0" /> : null}
        </button>
      ))}
    </div>
  );

  // Secuencia visible del invest: retirar de Blend → lockear en el tramo. Deja
  // claro que son 2 pasos (se firma 2 veces), no una pantalla colgada.
  const investSteps: { key: 'preparing' | 'locking'; label: string }[] = [
    { key: 'preparing', label: t('invest.steps.preparing', 'Getting your money ready') },
    {
      key: 'locking',
      label: t('invest.steps.locking', 'Locking in {{term}}', {
        term: selectedLock != null ? formatTimeDeposit(selectedLock) : '',
      }),
    },
  ];
  const activeIdx = investSteps.findIndex((s) => s.key === activeStep);
  const processingStep = (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex flex-col px-1">
        {investSteps.map((s, i) => {
          const isActive = s.key === activeStep;
          const isDone = activeIdx > i;
          const isLast = i === investSteps.length - 1;
          return (
            <div key={s.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-black transition-colors ${
                    isDone ? 'bg-success' : isActive ? 'bg-white' : 'bg-black/5'
                  }`}
                >
                  {isDone ? (
                    <FiCheck className="w-4 h-4 text-black" strokeWidth={3} />
                  ) : isActive ? (
                    <Spinner size="sm" color="current" />
                  ) : (
                    <span className="text-xs font-bold text-gray-400">{i + 1}</span>
                  )}
                </span>
                {!isLast ? (
                  <span
                    className={`w-0.5 flex-1 min-h-5 my-1 rounded-full transition-colors ${
                      isDone ? 'bg-success' : 'bg-black/15'
                    }`}
                  />
                ) : null}
              </div>
              <span
                className={`pt-1.5 text-sm ${
                  isActive ? 'font-bold text-black' : isDone ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

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
      <p className="text-lg font-bold text-black">{t('invest.success.title', 'Invested!')}</p>
      <p className="text-sm text-gray-500 text-center">
        {t('invest.success.subtitle', 'Your USDC is now locked and earning.')}
      </p>
    </div>
  );

  const STEP_CONTENT: Record<Step, React.ReactNode> = {
    amount: amountStep,
    term: termStep,
    processing: processingStep,
    success: successStep,
  };

  const STEP_TITLE: Record<Step, string> = {
    amount: t('portfolio.invest', 'Invest'),
    term: t('invest.selectTerm', 'Select a term'),
    processing: t('portfolio.invest', 'Invest'),
    success: t('portfolio.invest', 'Invest'),
  };

  const footer =
    step === 'amount' ? (
      <PressableButton
        variant="success"
        size="cta"
        className="py-2.5!"
        onClick={handleReview}
        disabled={!canReview}
      >
        {t('withdraw.review', 'Review')}
      </PressableButton>
    ) : step === 'processing' ? (
      <p className="w-full text-center text-xs text-gray-500">
        {t('withdraw.processingHint', 'This may take a few seconds.')}
      </p>
    ) : step === 'success' ? (
      <PressableButton variant="success" size="cta" className="py-2.5!" onClick={onOpenChange}>
        {t('common.done', 'Done')}
      </PressableButton>
    ) : undefined;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={STEP_TITLE[step]}
      size="md"
      isDismissable={step !== 'processing'}
      // Apilado sobre el panel de Portfolio: nunca cierra con X, siempre vuelve
      // atrás. El paso `term` retrocede al monto; el resto (raíz/éxito) vuelve al
      // panel. `processing` no navega: la tx ya salió.
      hideClose
      backVariant="primary"
      onBack={
        step === 'processing'
          ? undefined
          : step === 'term'
            ? () => setStep('amount')
            : onOpenChange
      }
      bodyClassName={'flex flex-col gap-3 ' + (footer ? 'pb-2' : 'pb-6')}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}
