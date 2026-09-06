'use client';

import {
  AMOUNT_DECIMALS,
  floorAmount,
  formatTokenPrecise,
  formatUsd,
  formatUsdPrecise,
  MIN_USDC,
} from '@/core-ui/helpers/numbers';
import { estimateRewardShare } from '@/core-ui/helpers/rewards';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import {
  useApyByLockPeriods,
  usePassiveLabel,
  usePassiveUsdc,
  useRestDeposit,
  useTransactions,
} from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { passiveWithdraw } from '@/networks/stellar/vaultDirect';
import { Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck } from 'react-icons/fi';
import { HiOutlineSelector } from 'react-icons/hi';
import { v4 } from 'uuid';
import { AmountStep, useAmountShake } from '../../molecules/AmountStep';
import { AppModal } from '../../molecules/AppModal';
import { ErrorNotice } from '../../molecules/ErrorNotice';
import { PressableButton } from '../../molecules/PressableButton';

type Step = 'amount' | 'term' | 'review' | 'processing' | 'success';

/**
 * "Invertir": crea una posición con lock en el Vaquita pool. Estilo teclado (como
 * el depósito a Blend), con un card presionable para elegir el PLAZO/APY. La plata
 * sale de BLEND (no de la wallet): al confirmar encadena
 *   1) directBlendWithdraw (Blend → wallet, mismo USDC/issuer)
 *   2) el depósito al Vaquita pool (createDeposit → transactionDeposit → confirm)
 */
export function InvestModal({
  open,
  onOpenChange,
  initialLockPeriod,
}: {
  open: boolean;
  onOpenChange: () => void;
  /** Plazo preseleccionado al abrir (ej. tocar "Invertir" en un plan vacío del
   *  Portfolio). Si no viene, arranca en el plazo más corto. */
  initialLockPeriod?: number;
}) {
  const { t } = useTranslation();
  const { walletAddress, token } = useConfigStore();
  const queryClient = useQueryClient();
  // Fondos disponibles para invertir = la posición pasiva (vault DeFindex con el
  // flag on, si no Blend). Es de donde sale la plata para lockear en el pool.
  const { usdc: passiveUsdc, refetch: refetchBlend } = usePassiveUsdc(walletAddress);
  const available = floorAmount(passiveUsdc, AMOUNT_DECIMALS);
  const passiveLabel = usePassiveLabel();

  const lockPeriods = useMemo(
    () => [...(token?.lockPeriods ?? [])].filter((p) => p > 0).sort((a, b) => a - b),
    [token?.lockPeriods],
  );
  const { byLockPeriod } = useApyByLockPeriods(lockPeriods, token?.symbol ?? '');
  const { getNextNonce, createDeposit, confirmDeposit, failDeposit } = useRestDeposit();
  const { transactionDeposit } = useTransactions();

  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [selectedLock, setSelectedLock] = useState<number | null>(null);
  // Guardamos el error TAL CUAL: `ErrorNotice` lo humaniza, y aplastarlo a
  // `.message` acá descartaría los errores tipados que ese mapeo reconoce.
  const [error, setError] = useState<unknown>(null);
  const [overBalance, setOverBalance] = useState(false);
  const [isMax, setIsMax] = useState(false);
  // Salto en curso durante "processing" (para el stepper). 'preparing' = retiro
  // de Blend; 'locking' = depósito al tramo.
  const [activeStep, setActiveStep] = useState<'preparing' | 'locking' | null>(null);
  const { controls: amountControls, shake } = useAmountShake();

  useEffect(() => {
    if (open) {
      setStep('amount');
      setAmount('');
      // Respeta el plazo con el que se abrió (Invertir desde un plan vacío);
      // si no aplica o ya no existe, cae al plazo más corto.
      setSelectedLock(
        initialLockPeriod != null && lockPeriods.includes(initialLockPeriod)
          ? initialLockPeriod
          : (lockPeriods[0] ?? null),
      );
      setError(null);
      setOverBalance(false);
      setIsMax(false);
      setActiveStep(null);
    }
  }, [open, lockPeriods, initialLockPeriod]);

  const numericAmount = Number(amount || '0');
  // En vez del % (que era premios/depósitos anualizado y engañoso), cada plazo
  // muestra lo cierto: su pool de premios + cuánto capital hay en el pool (ver PoolMeta).
  // Mismo piso que depósito y retiro: el backend lo rechaza igual, así que
  // conviene decirlo antes de firmar.
  const canReview = numericAmount >= MIN_USDC && selectedLock != null;

  const shakeAmount = () => {
    setOverBalance(true);
    shake();
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
    setError(null);
    setStep('review');
  };

  const handleConfirm = async () => {
    if (!token || !walletAddress || selectedLock == null || !transactionDeposit) return;
    setStep('processing');
    setActiveStep('preparing');
    setError(null);
    try {
      // 1) Posición pasiva → wallet (mismo USDC/issuer que acepta el Vaquita pool).
      // Con el flag on sale del vault DeFindex; si no, del retiro directo de Blend.
      await passiveWithdraw({
        address: walletAddress,
        amount,
        decimals: token.decimals,
        withdrawAll: isMax,
      });

      // 2) Depósito al Vaquita pool (crea la posición con lock).
      setActiveStep('locking');
      // Per-wallet nonce → the pool derives the position id as sha256(caller || nonce).
      const nonce = await getNextNonce();
      if (!nonce) throw new Error(t('withdraw.error.generic', 'Something went wrong'));
      const newDeposit = await createDeposit({
        amount: numericAmount,
        tokenSymbol: token.symbol,
        lockPeriod: selectedLock,
        vaquitaContract: token?.vaquitaContractAddress,
        nonce,
      });
      if (!newDeposit.success) throw new Error(t('withdraw.error.generic', 'Something went wrong'));

      const { success, txHash, transaction, depositIdHex, error: txError } = await transactionDeposit(
        nonce,
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
      void queryClient.invalidateQueries({ queryKey: ['defindex-vault-position'] });
      void queryClient.invalidateQueries({ queryKey: ['deposit'] });
      setStep('success');
    } catch (e) {
      setError(e ?? new Error(t('withdraw.error.generic', 'Something went wrong')));
      setStep('amount');
    }
  };

  // --- Paso: monto -----------------------------------------------------------
  const amountStep = (
    <div className="flex flex-col gap-2.5">
      <AmountStep
        value={amount}
        onValueChange={(next) => {
          setAmount(next);
          setIsMax(false);
        }}
        decimals={AMOUNT_DECIMALS}
        controls={amountControls}
        available={available}
        // "Available" = invertir todo lo pasivo: el retiro previo de Blend usa el
        // sentinel, no el monto tecleado.
        onMax={() => setIsMax(true)}
        error={overBalance ? t('withdraw.exceedsBalance', "That's more than you have available.") : null}
        onErrorClear={() => setOverBalance(false)}
        hint={t('withdraw.minWithdraw', 'Minimum withdrawal: {{amount}} USDC.', {
          amount: formatTokenPrecise(MIN_USDC, 2),
        })}
      >
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
              {selectedLock != null ? formatTimeDeposit(selectedLock) : t('invest.selectTerm', 'Select a term')}
            </span>
          </span>
          <HiOutlineSelector className="w-5 h-5 text-black shrink-0" />
        </PressableButton>
      </AmountStep>

      {error ? <ErrorNotice error={error} /> : null}
    </div>
  );

  // --- Paso: elegir plazo/APY (filas simples, no cards) ----------------------
  const termStep = (
    <div className="flex flex-col gap-2">
      {lockPeriods.map((lp) => {
        const isSelected = selectedLock === lp;
        return (
          <button
            key={lp}
            type="button"
            aria-pressed={isSelected}
            onClick={() => {
              setSelectedLock(lp);
              setStep('amount');
            }}
            // El plazo elegido se identifica con fondo + borde resaltado (no con un
            // check al costado): se lee de un vistazo cuál está activo.
            className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition active:translate-y-0.5 ${
              isSelected ? 'border-success bg-success/10' : 'border-black/10 bg-transparent hover:bg-black/[0.03]'
            }`}
          >
            <span className={`flex-1 min-w-0 text-sm font-bold ${isSelected ? 'text-success' : 'text-black'}`}>
              {formatTimeDeposit(lp)}
            </span>
            {/* Solo el tamaño del POZO del plazo, al otro extremo (sin "N deposits").
                Todavía no hay monto elegido, así que acá no se puede estimar la parte
                de cada uno: la etiqueta dice "pozo", no "premios tuyos". */}
            <span className="text-sm font-bold text-success tabular-nums shrink-0">
              {t('portfolio.poolRewards', '{{amount}} reward pool', {
                amount: formatUsd(byLockPeriod[lp]?.rewardPool ?? 0),
              })}
            </span>
          </button>
        );
      })}
    </div>
  );

  // Pozo y TVL del plazo elegido, resueltos una sola vez para el paso de review.
  // `selectedLock` puede ser null antes de elegir: ahí van ceros y la estimación da 0.
  const selectedPool = {
    rewardPool: selectedLock != null ? (byLockPeriod[selectedLock]?.rewardPool ?? 0) : 0,
    totalDeposits: selectedLock != null ? (byLockPeriod[selectedLock]?.totalDeposits ?? 0) : 0,
  };

  // --- Paso: revisar (resumen antes de firmar) -------------------------------
  // Muestra qué se va a invertir (monto, plazo, APY y de dónde sale) para que el
  // usuario confirme explícitamente antes de que salgan las 2 transacciones.
  const reviewStep = (
    <div className="flex flex-col gap-4">
      <div className="text-center pt-1">
        <p className="text-sm text-gray-500">{t('withdraw.amountLabel', 'Amount')}</p>
        <p className="text-4xl font-bold text-black">{formatUsdPrecise(numericAmount)}</p>
      </div>

      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('invest.review.termLabel', 'Term')}</span>
        <span className="font-bold text-black">
          {selectedLock != null ? formatTimeDeposit(selectedLock) : ''}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('portfolio.detail.rewardsPool', 'Pool rewards')}</span>
        <span className="font-bold text-black tabular-nums">{formatUsd(selectedPool.rewardPool)}</span>
      </div>

      {/* Lo que le tocaría a ESTE depósito, no el pozo entero. Todavía no entró al
          plazo, así que el denominador lleva `+ numericAmount`. */}
      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('portfolio.detail.yourShareEstimate', 'Your estimated share')}</span>
        <span className="font-bold text-success tabular-nums">
          {formatUsd(
            estimateRewardShare(selectedPool.rewardPool, selectedPool.totalDeposits + numericAmount, numericAmount),
          )}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('withdraw.fromLabel', 'From')}</span>
        <span className="font-bold text-black">{passiveLabel}</span>
      </div>

      <p className="text-xs text-gray-500">
        {t(
          'portfolio.detail.estimateNote',
          'Rewards are shared among everyone in this pool and can change as people join or leave.',
        )}
      </p>

      {error ? <ErrorNotice error={error} /> : null}
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
    review: reviewStep,
    processing: processingStep,
    success: successStep,
  };

  const STEP_TITLE: Record<Step, string> = {
    amount: t('portfolio.invest', 'Invest'),
    term: t('invest.selectTerm', 'Select a term'),
    review: t('invest.review.title', 'Review'),
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
    ) : step === 'review' ? (
      <PressableButton
        variant="success"
        size="cta"
        className="py-2.5!"
        onClick={() => void handleConfirm()}
      >
        {t('withdraw.confirmCta', 'Confirm')}
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
      // Los flujos de plata no se cierran tocando afuera en ningún paso (ver
      // WithdrawModal): sólo la X.
      isDismissable={false}
      // Convención de la app: la X (cerrar) va a la derecha y blanca. Los pasos
      // raíz (`amount`) y `success` cierran el modal → muestran la X. `term` y
      // `review` son navegación interna (vuelven al monto) → flecha atrás a la
      // izquierda. `processing` no navega ni cierra: la tx ya salió.
      hideClose={step === 'term' || step === 'review' || step === 'processing'}
      backVariant="white"
      onBack={step === 'term' || step === 'review' ? () => setStep('amount') : undefined}
      bodyClassName={'flex flex-col gap-3 ' + (footer ? 'pb-2' : 'pb-6')}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}
