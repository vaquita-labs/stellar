'use client';

import { getBlendUsdcBalance } from '@/networks/stellar/blendDirect';
import { isTxPendingError } from '@/networks/stellar/pollarError';
import { passiveDeposit } from '@/networks/stellar/vaultDirect';
import { Popover, PopoverContent, PopoverTrigger, Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { usePollar } from '@pollar/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BsBank2 } from 'react-icons/bs';
import { FiAlertCircle, FiCheck, FiInfo } from 'react-icons/fi';
import { IoWalletOutline } from 'react-icons/io5';
import {
  AMOUNT_DECIMALS,
  floorAmount,
  formatTokenPrecise,
  formatUsdPrecise,
  MIN_USDC,
  truncateMiddle,
} from '../../../helpers';
import { useAnalytics, useBlendPosition, useProfileData } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { AmountStep, useAmountShake } from '../../molecules/AmountStep';
import { AppModal } from '../../molecules/AppModal';
import { ErrorNotice } from '../../molecules/ErrorNotice';
import { PressableButton } from '../../molecules/PressableButton';

interface DepositMethodModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** "Ya tengo USDC": cierra este modal y abre el form de depósito (monto + lock). */
  onContinue: () => void;
  /** Onramp ARS: cierra este modal y abre el flujo de recibir fiat. */
  onOnramp: () => void;
  /** Social/custodial: cierra este modal y abre el modal de recibir a su dirección. */
  onReceive: () => void;
}

type Step = 'method' | 'amount' | 'confirm' | 'processing' | 'success';

/**
 * Paso previo al form de depósito: el usuario elige cómo fondear su cuenta
 * (banco vía onramp ARS o wallet cripto) o continúa directo si ya tiene USDC.
 *
 * La rama "wallet" es el depósito directo a Blend: mismo teclado que el retiro
 * (monto → confirmación → estado), pero los fondos salen del USDC que ya está
 * en la cuenta del usuario y van al pool de Blend sin lock de Vaquita.
 */
export function DepositMethodModal({
  open,
  onOpenChange,
  onOnramp,
  onReceive,
}: DepositMethodModalProps) {
  const { t } = useTranslation();
  const { walletAddress, token, network } = useConfigStore();
  const { data: profile } = useProfileData();
  const { trackUserAction, trackConversion, trackError } = useAnalytics();
  const [step, setStep] = useState<Step>('method');
  const [amount, setAmount] = useState('');
  // Guardamos el error TAL CUAL: `ErrorNotice` lo humaniza, y aplastarlo a
  // `.message` acá descartaría los errores tipados que ese mapeo reconoce.
  const [error, setError] = useState<unknown>(null);
  // El depósito ya salió a la red y todavía puede confirmar. No es un fallo del
  // que se pueda rehacer: apaga el reintento del CTA (ver `footer`).
  const txPending = isTxPendingError(error);
  // Se enciende cuando el usuario intenta revisar un monto mayor al disponible:
  // apaga el número a gris y dispara el temblor. Se apaga al seguir tecleando.
  const [overBalance, setOverBalance] = useState(false);
  const { controls: amountControls, shake } = useAmountShake();

  const queryClient = useQueryClient();
  const { refreshWalletBalance, wallet } = usePollar();
  // Login externo (Freighter/xBull) vs custodial/social (Pollar). El social no
  // "mueve" USDC que ya tiene: fondea RECIBIENDO a su dirección custodia, así que
  // su rama "Wallet" abre el modal de recibir NATIVO (no el de Pollar) vía onReceive.
  const isExternalWallet = wallet?.custody === 'external';
  // Techo del depósito = saldo del USDC QUE ACEPTA BLEND, leído on-chain. NO el
  // walletBalance de Pollar: en testnet hay varios USDC con el mismo código
  // "USDC" de emisores distintos, y Pollar puede reportar el de otro emisor. Si
  // usáramos ese como máximo, el usuario intentaría depositar plata que no tiene
  // de este emisor y el pool revierte con Error(Contract, #10) (balance fuera de
  // rango). Leyendo el USDC real de Blend, el techo siempre es depositable.
  const [blendUsdc, setBlendUsdc] = useState<number | null>(null);
  const available = blendUsdc ?? 0;
  const balanceIsLoading = blendUsdc === null;
  // Cada apertura arranca en la selección de método.
  useEffect(() => {
    if (open) {
      setStep('method');
      setAmount('');
      setError(null);
      setOverBalance(false);
    }
  }, [open]);

  // El teclado necesita el saldo real de la wallet para poner el techo.
  useEffect(() => {
    if (open && walletAddress) void refreshWalletBalance();
  }, [open, walletAddress, refreshWalletBalance]);

  // Carga on-chain del saldo del USDC de Blend: es el máximo real que se puede
  // depositar (ver comentario arriba). Se relee cada vez que se abre el modal.
  useEffect(() => {
    if (!open || !walletAddress || !token) return;
    let cancelled = false;
    setBlendUsdc(null);
    void getBlendUsdcBalance(walletAddress, token.decimals).then((b) => {
      if (!cancelled) setBlendUsdc(floorAmount(b, AMOUNT_DECIMALS));
    });
    return () => {
      cancelled = true;
    };
  }, [open, walletAddress, token]);

  // APY de supply del pool de Blend, en vivo on-chain. Es el rendimiento real que
  // gana este depósito directo (sin lock ni recompensas Vaquita), así que se
  // muestra en la confirmación para que el usuario sepa a cuánto rinde.
  const { data: blendPosition } = useBlendPosition(walletAddress ?? undefined);
  const blendApy = blendPosition?.apy ?? 0;

  const accountName =
    profile?.nickname || (walletAddress ? truncateMiddle(walletAddress, 6, 5) : '—');
  const numericAmount = Number(amount || '0');
  // Mínimo 1 USDC para depositar (mismo piso que valida el backend). Por debajo
  // el CTA queda gris, pero el aviso de mínimo bajo el saldo explica por qué —no
  // es un botón muerto sin contexto. Exceder el saldo se resuelve al presionar
  // Review (gris + temblor).
  const canReview = numericAmount >= MIN_USDC;

  const shakeAmount = () => {
    setOverBalance(true);
    shake();
  };

  const handleReview = () => {
    if (numericAmount > available) {
      shakeAmount();
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!token || !walletAddress) return;
    setStep('processing');
    setError(null);
    trackUserAction('direct_blend_deposit_attempted', {
      amount: numericAmount,
      token: token.symbol,
      network: network?.networkName ?? null,
    });
    try {
      await passiveDeposit({
        address: walletAddress,
        amount,
        decimals: token.decimals,
      });
      trackConversion('direct_blend_deposit_successful', numericAmount, token.symbol);
      void refreshWalletBalance();
      // La posición on-chain en Blend cambió: invalidar su query para que el
      // header y el PortfolioPanel reflejen el nuevo total sin esperar los 60s
      // de staleTime.
      void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
      void queryClient.invalidateQueries({ queryKey: ['defindex-vault-position'] });
      setStep('success');
    } catch (e) {
      trackError('direct_blend_deposit_failed', {
        amount: numericAmount,
        token: token.symbol,
        network: network?.networkName ?? null,
      });
      setError(e ?? new Error(t('withdraw.error.generic', 'Something went wrong')));
      setStep('confirm');
    }
  };

  // --- Paso: método ----------------------------------------------------------
  // Banco va primero: el público objetivo no es web3 y fondear desde el banco es
  // la vía que entiende sin explicación.
  const methodStep = (
    <div className="flex flex-col gap-2">
      <PressableButton variant="white" size="row" onClick={onOnramp}>
        <BsBank2 className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('deposit.method.onramp.title', 'Bank')}
          </span>
          <span className="block text-xs text-gray-500">
            {t('deposit.method.onramp.subtitle', 'Deposit with your local currency')}
          </span>
        </span>
      </PressableButton>
      <PressableButton
        variant="white"
        size="row"
        onClick={() => {
          // Externa: teclea el monto y hace supply directo a Blend (ya tiene el
          // USDC en su wallet). Social/custodial: no tiene de dónde "mover", así
          // que abre el modal de recibir NATIVO a su dirección para que le entre
          // plata (y de ahí se pone a invertir).
          if (isExternalWallet) {
            setStep('amount');
          } else {
            onReceive();
          }
        }}
      >
        <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('deposit.method.wallet.title', 'Wallet')}
          </span>
          <span className="block text-xs text-gray-500">
            {isExternalWallet
              ? t('deposit.method.wallet.subtitle', 'Deposit from a crypto wallet')
              : t('deposit.method.wallet.receiveSubtitle', 'Receive USDC to your address')}
          </span>
        </span>
      </PressableButton>
    </div>
  );

  // --- Paso: monto -----------------------------------------------------------
  const amountStep = (
    // `compact` a propósito: con el teclado + el CTA + el aviso de red, cualquier
    // aire de más obliga a scrollear el sheet en pantallas chicas y se corta el
    // monto, que es justo lo que el usuario mira.
    <AmountStep
      value={amount}
      onValueChange={setAmount}
      decimals={AMOUNT_DECIMALS}
      compact
      controls={amountControls}
      available={available}
      availableLoading={balanceIsLoading}
      error={overBalance ? t('withdraw.exceedsBalance', "That's more than you have available.") : null}
      onErrorClear={() => setOverBalance(false)}
      hint={t('deposit.receive.minDeposit', 'Minimum deposit: {{amount}} USDC.', {
        amount: formatTokenPrecise(MIN_USDC, 2),
      })}
    >
      {/* Origen de los fondos: la cuenta Vaquita del usuario. A diferencia del
          retiro no hay selector — el USDC solo puede salir de acá. */}
      <div className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-2.5">
        <Image
          src="/vaquita/vaquita_isotipo.svg"
          alt="Vaquita"
          width={22}
          height={22}
          className="shrink-0"
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black truncate">
            {profile?.nickname ? `@${accountName}` : accountName}
          </span>
          <span className="block text-xs text-gray-500">
            {t('deposit.blend.accountLabel', 'Vaquita account')}
          </span>
        </span>
      </div>
    </AmountStep>
  );

  // --- Paso: confirmación ----------------------------------------------------
  const confirmStep = (
    <div className="flex flex-col gap-4">
      <div className="text-center pt-1">
        <p className="text-sm text-gray-500">{t('withdraw.amountLabel', 'Amount')}</p>
        <p className="text-4xl font-bold text-black">{formatUsdPrecise(numericAmount)}</p>
      </div>

      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('withdraw.methodLabel', 'Method')}</span>
        <Popover>
          <PopoverTrigger>
            <button
              type="button"
              className="flex items-center gap-1 font-bold text-black underline decoration-dotted underline-offset-2"
            >
              {t('deposit.blend.destination', 'Blend')}
              <FiInfo className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </PopoverTrigger>
          <PopoverContent placement="top" offset={8} className="max-w-[240px]">
            <div className="px-1 py-2">
              <p className="text-xs font-bold text-black mb-1">
                {t('deposit.blend.whatIsTitle', 'What is Blend?')}
              </p>
              <p className="text-xs text-gray-600">
                {t(
                  'deposit.blend.whatIs',
                  'Blend is an audited lending protocol on Stellar. Your USDC is supplied to its pool to earn yield, and you can withdraw anytime.',
                )}
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('deposit.blend.apyLabel', 'Estimated APY')}</span>
        <span className="font-bold text-success">
          {blendApy > 0 ? `${blendApy.toFixed(2)}%` : '—'}
        </span>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-600">
        <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          {t(
            'deposit.blend.notTracked',
            'Your USDC starts earning yield right away, with no lock period withdraw whenever you want.',
          )}
        </p>
      </div>

      {error ? <ErrorNotice error={error} /> : null}
    </div>
  );

  // --- Pasos: procesando / éxito --------------------------------------------
  // Depósito directo a Blend = una sola operación on-chain. Se muestra con el
  // mismo lenguaje de "stepper" que el resto de los flujos (Invest/Withdraw):
  // una fila con el círculo + spinner, y el hint anclado abajo en el footer.
  const processingStep = (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex flex-col px-1">
        <div className="flex gap-3">
          <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-black bg-white">
            <Spinner size="sm" color="current" />
          </span>
          <span className="pt-1.5 text-sm font-bold text-black">
            {t('deposit.blend.processingStep', 'Depositing to your savings')}
          </span>
        </div>
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
      <p className="text-lg font-bold text-black">
        {t('deposit.blend.success.title', 'Deposit sent!')}
      </p>
      <p className="text-sm text-gray-500 text-center">
        {t('deposit.blend.success.subtitle', 'Your USDC is now earning in your savings.')}
      </p>
    </div>
  );

  const STEP_CONTENT: Record<Step, React.ReactNode> = {
    method: methodStep,
    amount: amountStep,
    confirm: confirmStep,
    processing: processingStep,
    success: successStep,
  };

  const STEP_TITLE: Record<Step, string> = {
    method: t('deposit.method.title', 'Select method'),
    amount: t('deposit.modal.title', 'Deposit'),
    confirm: t('deposit.blend.confirm.title', 'Confirm deposit'),
    processing: t('deposit.modal.title', 'Deposit'),
    success: t('deposit.modal.title', 'Deposit'),
  };

  // El back de cada paso. `processing` no vuelve atrás: la transacción ya salió.
  const BACK_TARGET: Partial<Record<Step, Step>> = {
    amount: 'method',
    confirm: 'amount',
  };
  const backTarget = BACK_TARGET[step];

  const footer =
    step === 'amount' ? (
      // El aviso de red va acá abajo (y no en el body) porque el teclado ya lo
      // empuja fuera de la vista: pegado al CTA se lee justo cuando el usuario
      // descubre que el botón no responde.
      <div className="flex w-full flex-col gap-2">
        <PressableButton
          variant="success"
          size="cta"
          className="py-2.5!"
          onClick={handleReview}
          disabled={!canReview}
        >
          {t('withdraw.review', 'Review')}
        </PressableButton>
      </div>
    ) : step === 'confirm' ? (
      // Con la transacción en vuelo el único botón honesto es cerrar: volver a
      // pulsar "Reintentar" mandaría un segundo depósito mientras el primero
      // todavía puede entrar al ledger, y el usuario pagaría dos veces. El hash
      // para seguirla lo muestra `ErrorNotice`.
      txPending ? (
        <PressableButton variant="white" size="cta" className="py-2.5!" onClick={onOpenChange}>
          {t('common.close', 'Close')}
        </PressableButton>
      ) : (
        <PressableButton variant="success" size="cta" className="py-2.5!" onClick={handleConfirm}>
          {error ? t('common.retry', 'Retry') : t('deposit.blend.cta', 'Deposit to your savings')}
        </PressableButton>
      )
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
      // Durante la transacción tampoco se puede cerrar ni volver atrás.
      hideClose={step === 'processing'}
      onBack={backTarget ? () => setStep(backTarget) : undefined}
      bodyClassName={'flex flex-col gap-3 ' + (footer ? 'pb-2' : 'pb-6')}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}
