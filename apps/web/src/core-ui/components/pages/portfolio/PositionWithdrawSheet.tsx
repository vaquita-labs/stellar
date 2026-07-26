'use client';

import { formatUsd } from '@/core-ui/helpers/numbers';
import { useRestWithdrawal, useTransactions } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import { directBlendSupply, getBlendUsdcBalance } from '@/networks/stellar/blendDirect';
import { Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiCheck } from 'react-icons/fi';
import { AppModal } from '../../molecules/AppModal';
import { ErrorNotice } from '../../molecules/ErrorNotice';
import { PressableButton } from '../../molecules/PressableButton';

type Step = 'confirm' | 'processing' | 'success';
type ActiveStep = 'withdrawing' | 'toBlend';

/**
 * Retiro de UNA posición desde el portafolio. A diferencia del retiro del mapa
 * (que paga a la wallet), la plata vuelve a las "savings" (Blend). Encadena:
 *   1) retirar del Vaquita pool → wallet (transactionWithdraw + confirmWithdrawal)
 *   2) depositar SOLO lo recibido (delta) en Blend (getBlendUsdcBalance + supply)
 * con stepper. Lo usa la ruta /portafolio: la lista + filtros viven en la página,
 * este sheet solo confirma y ejecuta el retiro del depósito elegido.
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
  const { walletAddress, token } = useConfigStore();
  const queryClient = useQueryClient();
  const { transactionWithdraw } = useTransactions();
  const { confirmWithdrawal } = useRestWithdrawal();

  const [step, setStep] = useState<Step>('confirm');
  const [activeStep, setActiveStep] = useState<ActiveStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep('confirm');
      setActiveStep(null);
      setError(null);
    }
  }, [open, deposit?.id]);

  const handleWithdraw = async () => {
    if (!deposit || !token || !walletAddress || !transactionWithdraw) return;
    setStep('processing');
    setActiveStep('withdrawing');
    setError(null);
    try {
      // Saldo USDC de la wallet ANTES de retirar: a Blend va SOLO el delta que
      // produce este retiro, nunca todo el saldo (si no barreríamos plata suelta).
      const balanceBefore = await getBlendUsdcBalance(walletAddress, token.decimals);

      // 1) Vaquita pool → wallet.
      const { success, txHash, transaction, error: wErr } = await transactionWithdraw(
        +deposit.id,
        deposit.depositIdHex,
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

  const confirmStep = (
    <div className="flex flex-col gap-4">
      <div className="text-center pt-1">
        <p className="text-sm text-gray-500">{t('withdraw.amountLabel', 'Amount')}</p>
        <p className="text-4xl font-bold text-black">{formatUsd(deposit?.amount ?? 0)}</p>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-600">
        <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          {t(
            'portfolio.withdraw.note',
            'Your funds (plus interest) go back to your savings, where they stay flexible and keep earning.',
          )}
        </p>
      </div>

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
    confirm: confirmStep,
    processing: processingStep,
    success: successStep,
  };

  const footer =
    step === 'confirm' ? (
      <PressableButton variant="success" size="cta" className="py-2.5!" onClick={handleWithdraw}>
        {t('portfolio.withdraw.cta', 'Withdraw to your savings')}
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

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('deposit.withdraw.button', 'Withdraw')}
      size="lg"
      isDismissable={step !== 'processing'}
      hideClose={step === 'processing'}
      bodyClassName={'flex flex-col gap-3 pb-2'}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}
