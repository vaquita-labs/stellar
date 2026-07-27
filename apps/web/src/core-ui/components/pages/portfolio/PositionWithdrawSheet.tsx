'use client';

import { getInterestData } from '@/core-ui/helpers';
import { formatTimeDeposit } from '@/core-ui/helpers/time';
import { useApyByLockPeriod, useRestWithdrawal, useTransactions } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import { directBlendSupply, getBlendUsdcBalance } from '@/networks/stellar/blendDirect';
import { Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiCheck, FiCheckCircle } from 'react-icons/fi';
import { AppModal } from '../../molecules/AppModal';
import { ErrorNotice } from '../../molecules/ErrorNotice';
import { PressableButton } from '../../molecules/PressableButton';

type Step = 'detail' | 'confirm' | 'processing' | 'success';
type ActiveStep = 'withdrawing' | 'toBlend';

/** Tile de una unidad del contador (días/horas/min/seg), estilo crema limpio. */
const TimeTile = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-1 min-w-0 flex-col items-center justify-center rounded-lg bg-white py-1.5">
    <span className="text-xl font-bold text-black tabular-nums leading-none">
      {value.toString().padStart(2, '0')}
    </span>
    <span className="mt-1 text-[10px] uppercase tracking-wider text-gray-400">{label}</span>
  </div>
);

/**
 * Retiro de UNA posición desde el portafolio, en tres pasos:
 *   1) `detail`  → cuánto tenés, cuánto rinde y cuánto falta para el vencimiento
 *                  (contador en vivo + barra de progreso).
 *   2) `confirm` → si estás a tiempo, lo que vas a RECIBIR; si retirás antes, lo
 *                  que vas a PERDER (los premios se pierden). Confirmás y listo.
 *   3) ejecución → retira del Vaquita pool a la wallet y re-deposita SOLO el delta
 *                  recibido en Blend (la plata vuelve a las savings, flexible).
 *
 * Reusa la lógica del detalle del mapa (`useVaquitaDetail`: lock/intereses/forfeit)
 * pero con el estilo limpio de los sheets del portafolio. Lo usa /portafolio: la
 * lista + filtros viven en la página, este sheet maneja el detalle y el retiro.
 */
export function PositionWithdrawSheet({
  deposit,
  open,
  onOpenChange,
  onWithdrawn,
}: {
  deposit: DepositResponseDTO | null;
  open: boolean;
  onOpenChange: () => void;
  /** Se llama tras un retiro exitoso (para refrescar la lista de la página). */
  onWithdrawn?: () => void;
}) {
  const { t } = useTranslation();
  const { walletAddress, token, network } = useConfigStore();
  const queryClient = useQueryClient();
  const { transactionWithdraw } = useTransactions();
  const { confirmWithdrawal } = useRestWithdrawal();
  const { data: dataApy } = useApyByLockPeriod(deposit?.lockPeriod ?? 0, token?.symbol ?? '');

  const [step, setStep] = useState<Step>('detail');
  const [activeStep, setActiveStep] = useState<ActiveStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Contador en vivo: re-render cada segundo mientras el usuario mira el detalle
  // o la confirmación (no hace falta seguir tickeando durante el retiro).
  const [now, setNow] = useState(() => Date.now());
  const ticking = open && (step === 'detail' || step === 'confirm');
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  useEffect(() => {
    if (open) {
      setStep('detail');
      setActiveStep(null);
      setError(null);
      setNow(Date.now());
    }
  }, [open, deposit?.id]);

  // "Ahora" real corrigiendo el reloj congelado del cache (igual que la lista):
  // serverTimestamp + lo transcurrido en el cliente desde el fetch.
  const currentTime =
    deposit?.serverTimestamp && deposit?.fetchedAtTimestamp
      ? deposit.serverTimestamp + (now - deposit.fetchedAtTimestamp)
      : now;
  const finalization = (deposit?.createdTimestamp ?? 0) + (deposit?.lockPeriod ?? 0);
  const secRemaining = Math.max(0, Math.floor((finalization - currentTime) / 1000));
  const inLock = secRemaining > 0;
  const lockSeconds = Math.max(1, Math.floor((deposit?.lockPeriod ?? 0) / 1000));
  const progress = Math.min(100, Math.max(0, ((lockSeconds - secRemaining) / lockSeconds) * 100));
  const countdown = {
    days: Math.floor(secRemaining / 86400),
    hours: Math.floor((secRemaining % 86400) / 3600),
    minutes: Math.floor((secRemaining % 3600) / 60),
    seconds: secRemaining % 60,
  };

  // Interés proyectado del plazo (mismo cálculo que la card del depósito).
  const interest = getInterestData(network!, dataApy, deposit?.amount ?? 0, deposit?.lockPeriod ?? 0);
  const vaquitaInterest = interest.vaquitaInterest;
  const protocolInterest = interest.protocolInterest + interest.blendInterest;
  const totalInterest = interest.totalInterest;
  const amount = deposit?.amount ?? 0;
  // A tiempo cobrás capital + interés; antes de tiempo solo el capital (perdés el premio).
  const finalReceive = inLock ? amount : amount + totalInterest;

  const handleWithdraw = async () => {
    if (!deposit || !token || !walletAddress || !transactionWithdraw) return;
    setStep('processing');
    setActiveStep('withdrawing');
    setError(null);
    try {
      // Saldo USDC de la wallet ANTES de retirar: a Blend va SOLO el delta que
      // produce este retiro, nunca todo el saldo (si no barreríamos plata suelta).
      const balanceBefore = await getBlendUsdcBalance(walletAddress, token.decimals);

      // 1) Vaquita pool → wallet. The pool re-derives the id from the caller +
      // the position's nonce, so we pass the stored nonce.
      if (deposit.nonce == null) throw new Error('Position is missing its nonce; cannot withdraw');
      const { success, txHash, transaction, error: wErr } = await transactionWithdraw(
        deposit.nonce,
        deposit.vaquitaContractAddress,
      );
      if (!success) throw (wErr as Error) ?? new Error(t('withdraw.error.generic', 'Something went wrong'));
      await confirmWithdrawal({
        depositId: +deposit.id,
        txHash: txHash || `${Date.now()}`,
        transactionRaw: JSON.stringify(transaction, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        ),
      });

      // 2) Solo lo recibido (delta) → Blend. Truncamos (floor) a los decimales
      // del token para nunca pedir más de lo que entró.
      setActiveStep('toBlend');
      const balanceAfter = await getBlendUsdcBalance(walletAddress, token.decimals);
      const factor = 10 ** token.decimals;
      const receivedBase = Math.floor((balanceAfter - balanceBefore) * factor);
      if (receivedBase > 0) {
        await directBlendSupply({
          address: walletAddress,
          amount: (receivedBase / factor).toFixed(token.decimals),
          decimals: token.decimals,
        });
      }

      void queryClient.invalidateQueries({ queryKey: ['deposit'] });
      void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
      onWithdrawn?.();
      setStep('success');
    } catch (e) {
      setError((e as Error)?.message ?? t('withdraw.error.generic', 'Something went wrong'));
      setStep('confirm');
    }
  };

  const steps: { key: ActiveStep; label: string }[] = [
    { key: 'withdrawing', label: t('portfolio.withdraw.step1', 'Getting your money out') },
    { key: 'toBlend', label: t('portfolio.withdraw.step2', 'Moving it back to your savings') },
  ];
  const activeIdx = steps.findIndex((s) => s.key === activeStep);

  // ── Paso 1: detalle de la posición (cuánto tenés + cuánto falta). ──
  const detailStep = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-0.5 text-center">
        <p className="text-3xl font-bold text-black tabular-nums">
          {amount.toFixed(2)} <span className="text-xl font-semibold">{token?.symbol}</span>
        </p>
        <p className="text-sm font-bold text-success tabular-nums">
          +{totalInterest.toFixed(2)} {token?.symbol} {t('deposit.detail.estAbbrev', 'est.')}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${inLock ? 'text-primary' : 'text-success'}`}>
            {inLock ? t('deposit.detail.locked', 'Locked') : t('deposit.detail.readyToWithdraw', 'Ready to withdraw')}
          </span>
          <span className="text-xs text-gray-500 tabular-nums">{Math.round(progress)}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${inLock ? 'bg-primary' : 'bg-success'}`}
            style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
          />
        </div>
        {inLock ? (
          <div className="mt-1 flex gap-2">
            <TimeTile value={countdown.days} label={t('deposit.detail.days', 'Days')} />
            <TimeTile value={countdown.hours} label={t('deposit.detail.hours', 'Hours')} />
            <TimeTile value={countdown.minutes} label={t('deposit.detail.min', 'Min')} />
            <TimeTile value={countdown.seconds} label={t('deposit.detail.sec', 'Sec')} />
          </div>
        ) : null}
      </div>

      <div className="divide-y divide-black/10">
        <div className="flex items-center justify-between gap-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 text-gray-500">
            {t('deposit.detail.vaquitaInterest', 'Vaquita interest')}
            {dataApy ? (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary whitespace-nowrap">
                {dataApy.vaquitaApy.toFixed(2)}% APY
              </span>
            ) : null}
          </span>
          <span className="font-bold text-black tabular-nums shrink-0">
            +{vaquitaInterest.toFixed(2)} {token?.symbol}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 text-xs">
          <span className="text-gray-500">{t('deposit.detail.protocolInterest', 'Protocol interest')}</span>
          <span className="font-bold text-black tabular-nums">
            +{protocolInterest.toFixed(2)} {token?.symbol}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 text-xs">
          <span className="font-bold text-black">{t('deposit.detail.totalEstEarnings', 'Total est. earnings')}</span>
          <span className="font-bold text-success tabular-nums">
            +{totalInterest.toFixed(2)} {token?.symbol}
          </span>
        </div>
      </div>
    </div>
  );

  // ── Paso 2: confirmar (a tiempo = lo que ganás / antes = lo que perdés). ──
  // Compacto y sin cards: el número grande centrado, y una sola fila que resume
  // el estado (verde "listo" a tiempo / roja "perdés X" antes de tiempo).
  const confirmStep = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-0.5 pt-1 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t('deposit.confirm.youWillReceive', 'You will receive')}
        </p>
        <p className={`text-4xl font-bold tabular-nums ${inLock ? 'text-black' : 'text-success'}`}>
          {finalReceive.toFixed(2)} <span className="text-2xl font-semibold">{token?.symbol}</span>
        </p>
      </div>

      {inLock ? (
        <>
          <div className="flex items-center justify-between rounded-lg bg-error/10 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-error">
              <FiAlertTriangle className="h-4 w-4 shrink-0" />
              {t('deposit.confirm.youWillLose', 'You will lose')}
            </span>
            <span className="text-sm font-bold text-error tabular-nums">
              −{totalInterest.toFixed(2)} {token?.symbol}
            </span>
          </div>
          <p className="text-center text-xs text-gray-500">
            {t('deposit.confirm.earlyWithdrawalPrefix', 'Early withdrawal rewards will be')}{' '}
            <span className="font-semibold text-error">{t('deposit.confirm.forfeited', 'forfeited')}</span>.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg bg-success/10 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-success">
              <FiCheckCircle className="h-4 w-4 shrink-0" />
              {t('deposit.confirm.youWillEarn', 'You will earn')}
            </span>
            <span className="text-sm font-bold text-success tabular-nums">
              +{totalInterest.toFixed(2)} {token?.symbol}
            </span>
          </div>
          <p className="text-center text-xs text-gray-500">
            {t('deposit.confirm.readyToClaim', 'Your vaquita is ready to claim.')}
          </p>
        </>
      )}

      {error ? <ErrorNotice error={error} /> : null}
    </div>
  );

  const processingStep = (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex flex-col px-1">
        {steps.map((s, i) => {
          const isActive = s.key === activeStep;
          const isDone = activeIdx > i;
          const isLast = i === steps.length - 1;
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
      <p className="text-lg font-bold text-black">{t('portfolio.withdraw.successTitle', 'Back in your savings!')}</p>
      <p className="text-sm text-gray-500 text-center">
        {t('portfolio.withdraw.successSubtitle', 'Your funds are flexible again and keep earning in your savings.')}
      </p>
    </div>
  );

  const STEP_CONTENT: Record<Step, React.ReactNode> = {
    detail: detailStep,
    confirm: confirmStep,
    processing: processingStep,
    success: successStep,
  };

  const footer =
    step === 'detail' ? (
      <PressableButton
        variant={inLock ? 'white' : 'success'}
        size="cta"
        className="py-2.5!"
        onClick={() => {
          setError(null);
          setStep('confirm');
        }}
      >
        {t('deposit.withdraw.button', 'Withdraw')}
      </PressableButton>
    ) : step === 'confirm' ? (
      <PressableButton
        variant={inLock ? 'danger' : 'success'}
        size="cta"
        className="py-2.5!"
        onClick={handleWithdraw}
      >
        {error
          ? t('common.retry', 'Retry')
          : inLock
            ? t('deposit.withdraw.withdrawAnyway', 'Withdraw anyway')
            : t('portfolio.withdraw.cta', 'Withdraw to your savings')}
      </PressableButton>
    ) : step === 'processing' ? (
      <p className="w-full text-center text-xs text-gray-500">
        {t('withdraw.processingHint', 'This may take a few seconds.')}
      </p>
    ) : (
      <PressableButton variant="success" size="cta" className="py-2.5!" onClick={onOpenChange}>
        {t('common.done', 'Done')}
      </PressableButton>
    );

  const title =
    step === 'confirm'
      ? t('deposit.confirm.title', 'Confirm withdrawal')
      : step === 'success'
        ? t('portfolio.withdraw.successTitle', 'Back in your savings!')
        : formatTimeDeposit(deposit?.lockPeriod ?? 0);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="lg"
      // En confirm, la flecha atrás vuelve al detalle (mismo modal, sin abrir otro).
      onBack={step === 'confirm' ? () => setStep('detail') : undefined}
      isDismissable={step !== 'processing'}
      hideClose={step === 'processing'}
      bodyClassName={'flex flex-col gap-3 pb-2'}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}
