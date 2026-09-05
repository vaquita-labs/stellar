'use client';

import { AMOUNT_DECIMALS, MIN_USDC, formatTokenPrecise, formatUsd, formatUsdPrecise } from '@/core-ui/helpers/numbers';
import { estimateRewardShare } from '@/core-ui/helpers/rewards';
import { humanizeTxError } from '@/core-ui/helpers/txError';
import { Spinner } from '@heroui/react';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowRight, FiCheck, FiRepeat } from 'react-icons/fi';
import { AmountStep, useAmountShake } from '../../molecules/AmountStep';
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
  // apaga el número, lo hace temblar y escribe el motivo en la línea de nota.
  // Se apaga al seguir tecleando.
  const [overBalance, setOverBalance] = useState(false);
  const { controls: amountControls, shake } = useAmountShake();

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
  // El mínimo es el mismo que en depósito y retiro: mover es retirar y volver a
  // depositar, así que el piso del contrato aplica igual.
  const canReview = numericAmount >= MIN_USDC && !!from && !!to;

  // En vez del APY ponderado (premios/depósito anualizado, engañoso), mostramos
  // lo cierto del plazo destino: su pool de premios + depósitos (ver PoolMeta).

  const shakeAmount = () => {
    setOverBalance(true);
    shake();
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
    <AmountStep
      value={amount}
      onValueChange={setAmount}
      decimals={AMOUNT_DECIMALS}
      size="lg"
      controls={amountControls}
      available={from?.amount ?? null}
      error={overBalance ? t('withdraw.exceedsBalance', "That's more than you have available.") : null}
      onErrorClear={() => setOverBalance(false)}
      hint={t('withdraw.minWithdraw', 'Minimum withdrawal: {{amount}} USDC.', {
        amount: formatTokenPrecise(MIN_USDC, 2),
      })}
    >
      {/* El par origen/destino va entre el número y el teclado: es lo que decide
          contra qué saldo se compara lo que se está tecleando. */}
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
        {/* Las cifras del plazo destino, pegadas a la pastilla que las cambia y
            no bajo el monto: ahí abajo va el mínimo/el error. */}
        <PoolMeta
          rewardPool={to?.rewardPool ?? 0}
          totalDeposits={to?.totalDeposits ?? 0}
          className="mt-1.5 text-right text-xs text-gray-500"
        />
      </div>
    </AmountStep>
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

      {/* Lo que le tocaría a este monto en el plazo de DESTINO. La plata todavía no
          está ahí, así que el denominador suma `numericAmount` al TVL de destino. */}
      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('portfolio.detail.yourShareEstimate', 'Your estimated share')}</span>
        <span className="font-bold text-success tabular-nums">
          {formatUsd(estimateRewardShare(to?.rewardPool ?? 0, (to?.totalDeposits ?? 0) + numericAmount, numericAmount))}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        {t(
          'portfolio.detail.estimateNote',
          'Rewards are shared among everyone in this pool and can change as people join or leave.',
        )}
      </p>

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
      // Los flujos de plata no se cierran tocando afuera en ningún paso (ver
      // WithdrawModal): sólo la X.
      isDismissable={false}
      // Durante la transacción tampoco se puede cerrar ni volver atrás.
      hideClose={step === 'processing'}
      onBack={step === 'confirm' ? () => setStep('amount') : undefined}
      bodyClassName={'flex flex-col gap-3 ' + (footer ? 'pb-2' : 'pb-6')}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}
