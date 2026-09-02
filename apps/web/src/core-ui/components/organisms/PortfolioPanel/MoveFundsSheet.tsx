'use client';

import { AMOUNT_DECIMALS, formatTokenPrecise, formatUsd, formatUsdPrecise } from '@/core-ui/helpers/numbers';
import { humanizeTxError } from '@/core-ui/helpers/txError';
import { Spinner } from '@heroui/react';
import { motion, useAnimationControls } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowRight, FiCheck, FiRepeat } from 'react-icons/fi';
import { AmountDisplay } from '../../molecules/AmountDisplay';
import { AmountKeypad } from '../../molecules/AmountKeypad';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';
import { getAllocationStyle } from './allocationStyles';
import { PoolMeta } from './PoolMeta';
import { Allocation, MoveFundsStep } from './types';

interface MoveFundsSheetProps {
  open: boolean;
  onOpenChange: () => void;
  /** Todas las allocations, en el mismo orden (y con los mismos estilos) que la lista. */
  allocations: Allocation[];
  /** Plazo destino con el que abre la hoja (el detalle desde el que se entró). */
  initialToLockPeriod?: number;
  /**
   * Ejecuta el movimiento. Hoy es un placeholder: mover entre plazos implica
   * retirar la posición y volver a depositarla, y el contrato solo retira la
   * posición entera pagando al firmante (contracts/vaquita-pool/src/lib.rs:168).
   */
  onSubmit: (params: { amount: number; from: Allocation; to: Allocation }) => Promise<void>;
}

/**
 * Mover capital de un plazo a otro: monto con teclado propio → confirmación →
 * estado. El par origen/destino se elige tocando las pastillas (ciclan por los
 * plazos disponibles) o invirtiéndolo con el botón del medio.
 *
 * Pasos como `useState` + `onBack` de AppModal, igual que `WithdrawModal`.
 */
export function MoveFundsSheet({
  open,
  onOpenChange,
  allocations,
  initialToLockPeriod,
  onSubmit,
}: MoveFundsSheetProps) {
  const { t } = useTranslation();

  const [step, setStep] = useState<MoveFundsStep>('amount');
  const [amount, setAmount] = useState('');
  const [fromLockPeriod, setFromLockPeriod] = useState<number | null>(null);
  const [toLockPeriod, setToLockPeriod] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Se enciende al intentar revisar un monto mayor al disponible en el origen:
  // apaga el número y dispara el temblor. Se apaga al seguir tecleando.
  const [overBalance, setOverBalance] = useState(false);
  const amountControls = useAnimationControls();

  // Los montos se refrescan solos cuando vuelve la lista de depósitos, así que
  // `allocations` cambia de identidad seguido. El reset de abajo solo debe
  // correr al abrir, no en cada refetch: por eso se lee por ref.
  const allocationsRef = useRef(allocations);
  allocationsRef.current = allocations;

  // Cada apertura arranca limpia. Por defecto se mueve DESDE el plazo con más
  // capital HACIA el que abrió la hoja (o el más largo de la lista).
  useEffect(() => {
    if (!open) return;
    const current = allocationsRef.current;
    if (current.length < 2) return;
    const to = current.find((a) => a.lockPeriod === initialToLockPeriod) ?? current[current.length - 1];
    const from =
      [...current].filter((a) => a.lockPeriod !== to.lockPeriod).sort((a, b) => b.amount - a.amount)[0] ?? current[0];
    setStep('amount');
    setAmount('');
    setError(null);
    setOverBalance(false);
    setFromLockPeriod(from.lockPeriod);
    setToLockPeriod(to.lockPeriod);
  }, [open, initialToLockPeriod]);

  const from = allocations.find((a) => a.lockPeriod === fromLockPeriod) ?? null;
  const to = allocations.find((a) => a.lockPeriod === toLockPeriod) ?? null;
  const fromStyle = getAllocationStyle(allocations.findIndex((a) => a.lockPeriod === fromLockPeriod));
  const toStyle = getAllocationStyle(allocations.findIndex((a) => a.lockPeriod === toLockPeriod));

  const numericAmount = Number(amount || '0');
  const canReview = numericAmount > 0 && !!from && !!to;

  // En vez del APY ponderado (premios/depósito anualizado, engañoso), mostramos
  // lo cierto del plazo destino: su pool de premios + depósitos (ver PoolMeta).

  const shakeAmount = () => {
    setOverBalance(true);
    void amountControls.start({
      x: [0, -8, 8, -6, 6, -3, 3, 0],
      transition: { duration: 0.45, ease: 'easeInOut' },
    });
  };

  /** Avanza el lado indicado al siguiente plazo, saltándose el del otro lado. */
  const cycleSide = (side: 'from' | 'to') => {
    const currentLockPeriod = side === 'from' ? fromLockPeriod : toLockPeriod;
    const otherLockPeriod = side === 'from' ? toLockPeriod : fromLockPeriod;
    const idx = allocations.findIndex((a) => a.lockPeriod === currentLockPeriod);
    for (let i = 1; i <= allocations.length; i++) {
      const candidate = allocations[(idx + i) % allocations.length];
      if (candidate.lockPeriod !== otherLockPeriod) {
        if (side === 'from') setFromLockPeriod(candidate.lockPeriod);
        else setToLockPeriod(candidate.lockPeriod);
        if (overBalance) setOverBalance(false);
        return;
      }
    }
  };

  const swapSides = () => {
    setFromLockPeriod(toLockPeriod);
    setToLockPeriod(fromLockPeriod);
    if (overBalance) setOverBalance(false);
  };

  const handleReview = () => {
    if (!from || numericAmount > from.amount) {
      shakeAmount();
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!from || !to) return;
    setStep('processing');
    setError(null);
    try {
      await onSubmit({ amount: numericAmount, from, to });
      setStep('success');
    } catch (e) {
      setError(humanizeTxError(e, t).title);
      setStep('confirm');
    }
  };

  /** Pastilla de un lado del movimiento: plazo + capital disponible ahí. */
  const sidePill = (side: 'from' | 'to') => {
    const allocation = side === 'from' ? from : to;
    const style = side === 'from' ? fromStyle : toStyle;
    if (!allocation) return <div className="flex-1" />;
    return (
      <button
        type="button"
        onClick={() => cycleSide(side)}
        className={`flex-1 min-w-0 rounded-xl border border-black border-b-2 px-3 py-2.5 text-left transition active:translate-y-0.5 ${style.solid}`}
      >
        <span className="block text-sm font-bold truncate">{allocation.label}</span>
        <span className="block text-xs opacity-80 tabular-nums">{formatUsdPrecise(allocation.amount)}</span>
      </button>
    );
  };

  // --- Paso: monto -----------------------------------------------------------
  const amountStep = (
    <div className="flex flex-col gap-4">
      <div className="text-center pt-1">
        <AmountDisplay value={amount} controls={amountControls} muted={overBalance || amount === ''} size="lg" />
        <PoolMeta
          rewardPool={to?.rewardPool ?? 0}
          totalDeposits={to?.totalDeposits ?? 0}
          className="mt-1 text-xs text-gray-500"
        />
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>{t('portfolio.move.from', 'From')}</span>
          <span>{t('portfolio.move.to', 'To')}</span>
        </div>
        <div className="flex items-center gap-2">
          {sidePill('from')}
          <button
            type="button"
            onClick={swapSides}
            aria-label={t('portfolio.move.swapAria', 'Swap direction')}
            className="shrink-0 w-10 h-10 rounded-full border border-black border-b-2 bg-white flex items-center justify-center text-black transition active:translate-y-0.5 hover:bg-[#F5FBFF]"
          >
            <FiRepeat className="w-4 h-4" />
          </button>
          {sidePill('to')}
        </div>
      </div>

      <AmountKeypad
        value={amount}
        onValueChange={(next) => {
          setAmount(next);
          if (overBalance) setOverBalance(false);
        }}
        maxDecimals={AMOUNT_DECIMALS}
      />
    </div>
  );

  // --- Paso: confirmación ----------------------------------------------------
  const confirmStep = (
    <div className="flex flex-col gap-4">
      <div className="text-center pt-1">
        <p className="text-sm text-gray-500">{t('portfolio.move.amount', 'Amount')}</p>
        <p className="text-4xl font-bold text-black tabular-nums">{formatUsdPrecise(numericAmount)}</p>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500 shrink-0">{t('portfolio.move.movePair', 'Move')}</span>
        <span className="flex items-center gap-1.5 font-bold text-black min-w-0">
          <span className="truncate">{from?.label}</span>
          <FiArrowRight className="w-4 h-4 shrink-0" />
          <span className="truncate">{to?.label}</span>
        </span>
      </div>

      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('portfolio.detail.rewardsPool', 'Pool rewards')}</span>
        <span className="font-bold text-black tabular-nums">{formatUsd(to?.rewardPool ?? 0)}</span>
      </div>

      {error ? <p className="text-sm text-error font-semibold">{error}</p> : null}
    </div>
  );

  // --- Pasos: procesando / éxito --------------------------------------------
  const processingStep = (
    <div className="flex flex-col items-center justify-center gap-4 py-10">
      <Spinner size="lg" color="accent" />
      <p className="text-base font-bold text-black">{t('portfolio.move.processing', 'Moving funds...')}</p>
      <p className="text-sm text-gray-500 text-center">
        {t('withdraw.processingHint', 'This may take a few seconds.')}
      </p>
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
      <p className="text-lg font-bold text-black">{t('portfolio.move.success.title', 'Funds moved!')}</p>
      <p className="text-sm text-gray-500 text-center">
        {t('portfolio.move.success.subtitle', '${{amount}} moved from {{from}} to {{to}}.', {
          amount: formatTokenPrecise(numericAmount),
          from: from?.label ?? '',
          to: to?.label ?? '',
        })}
      </p>
    </div>
  );

  const STEP_CONTENT: Record<MoveFundsStep, React.ReactNode> = {
    amount: amountStep,
    confirm: confirmStep,
    processing: processingStep,
    success: successStep,
  };

  const STEP_TITLE: Record<MoveFundsStep, string> = {
    amount: t('portfolio.move.title', 'Move funds'),
    confirm: t('portfolio.move.confirmTitle', 'Confirm move'),
    processing: t('portfolio.move.title', 'Move funds'),
    success: t('portfolio.move.title', 'Move funds'),
  };

  const footer =
    step === 'amount' ? (
      <PressableButton variant="success" size="cta" onClick={handleReview} disabled={!canReview}>
        {t('withdraw.review', 'Review')}
      </PressableButton>
    ) : step === 'confirm' ? (
      <PressableButton variant="success" size="cta" onClick={handleConfirm}>
        {t('common.confirm', 'Confirm')}
      </PressableButton>
    ) : step === 'success' ? (
      <PressableButton variant="success" size="cta" onClick={onOpenChange}>
        {t('common.done', 'Done')}
      </PressableButton>
    ) : undefined;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={STEP_TITLE[step]}
      size="md"
      // Durante la transacción la hoja no se puede cerrar ni volver atrás.
      isDismissable={step !== 'processing'}
      hideClose={step === 'processing'}
      onBack={step === 'confirm' ? () => setStep('amount') : undefined}
      bodyClassName={'flex flex-col gap-3 ' + (footer ? 'pb-2' : 'pb-6')}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}
