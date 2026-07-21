'use client';

import { directBlendMainnetSupply } from '@/networks/stellar/blendDirect';
import { Spinner } from '@heroui/react';
import { motion, useAnimationControls } from 'framer-motion';
import Image from 'next/image';
import { usePollar } from '@pollar/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BsBank2 } from 'react-icons/bs';
import { FiAlertCircle, FiCheck, FiChevronRight } from 'react-icons/fi';
import { IoWalletOutline } from 'react-icons/io5';
import { truncateDecimals, truncateMiddle } from '../../../helpers';
import { useAnalytics, useProfileData } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { AmountKeypad } from '../../molecules/AmountKeypad';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

interface DepositMethodModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** "Ya tengo USDC": cierra este modal y abre el form de depósito (monto + lock). */
  onContinue: () => void;
  /** Onramp ARS: cierra este modal y abre el flujo de recibir fiat. */
  onOnramp: () => void;
}

type Step = 'method' | 'amount' | 'confirm' | 'processing' | 'success';

/** Formatea el monto tecleado tal cual lo escribe el usuario ('' → $0.00, '1.' → $1.). */
function displayAmount(raw: string) {
  if (raw === '') return '$0.00';
  return `$${raw}`;
}

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
  onContinue,
  onOnramp,
}: DepositMethodModalProps) {
  const { t } = useTranslation();
  const { walletAddress, token, network } = useConfigStore();
  const { data: profile } = useProfileData();
  const { trackUserAction, trackConversion, trackError } = useAnalytics();
  const [step, setStep] = useState<Step>('method');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Se enciende cuando el usuario intenta revisar un monto mayor al disponible:
  // apaga el número a gris y dispara el temblor. Se apaga al seguir tecleando.
  const [overBalance, setOverBalance] = useState(false);
  const amountControls = useAnimationControls();

  const { walletBalance, refreshWalletBalance } = usePollar();
  const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];
  // Pollar devuelve los balances ya en unidades humanas; el nativo se matchea por
  // `type` y el resto por código de asset (== `symbol` del token de config).
  const tokenBalance = balances.find((b) =>
    token?.isNative ? b.type === 'native' : b.code.toUpperCase() === token?.symbol?.toUpperCase(),
  );
  const available = tokenBalance ? truncateDecimals(Number(tokenBalance.available), 2) : 0;
  const balanceIsLoading = walletBalance.step === 'loading';
  const isMainnet = network?.type === 'mainnet';

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

  const accountName =
    profile?.nickname || (walletAddress ? truncateMiddle(walletAddress, 6, 5) : '—');
  const numericAmount = Number(amount || '0');
  // Igual que en el retiro: cualquier monto > 0 habilita el CTA. Exceder el
  // saldo se resuelve al presionar Review (gris + temblor), no con un botón
  // muerto que no explica nada.
  const canReview = numericAmount > 0 && isMainnet;

  const shakeAmount = () => {
    setOverBalance(true);
    void amountControls.start({
      x: [0, -8, 8, -6, 6, -3, 3, 0],
      transition: { duration: 0.45, ease: 'easeInOut' },
    });
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
      const { hash } = await directBlendMainnetSupply({
        address: walletAddress,
        amount,
        decimals: token.decimals,
      });
      console.info('[direct-blend-deposit] submitted', { hash });
      trackConversion('direct_blend_deposit_successful', numericAmount, token.symbol);
      void refreshWalletBalance();
      setStep('success');
    } catch (e) {
      trackError('direct_blend_deposit_failed', {
        amount: numericAmount,
        token: token.symbol,
        network: network?.networkName ?? null,
      });
      setError((e as Error)?.message ?? t('withdraw.error.generic', 'Something went wrong'));
      setStep('confirm');
    }
  };

  // --- Paso: método ----------------------------------------------------------
  // Banco va primero: el público objetivo no es web3 y fondear desde el banco es
  // la vía que entiende sin explicación.
  const methodStep = (
    <>
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
        <FiChevronRight className="w-5 h-5 text-black shrink-0" />
      </PressableButton>
      <PressableButton variant="white" size="row" onClick={() => setStep('amount')}>
        <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('deposit.method.wallet.title', 'Wallet')}
          </span>
          <span className="block text-xs text-gray-500">
            {t('deposit.method.wallet.subtitle', 'Deposit from a crypto wallet')}
          </span>
        </span>
        <FiChevronRight className="w-5 h-5 text-black shrink-0" />
      </PressableButton>
    </>
  );

  // --- Paso: monto -----------------------------------------------------------
  const amountStep = (
    // Todo el paso está apretado a propósito: con el teclado + el CTA + el aviso
    // de red, cualquier aire de más obliga a scrollear el sheet en pantallas
    // chicas y se corta el monto, que es justo lo que el usuario mira.
    <div className="flex flex-col gap-2.5">
      <div className="text-center">
        <motion.p
          animate={amountControls}
          className={`text-3xl font-bold ${
            overBalance || amount === '' ? 'text-gray-400' : 'text-black'
          }`}
        >
          {displayAmount(amount)}
        </motion.p>
        <button
          type="button"
          onClick={() => {
            setAmount(String(available));
            if (overBalance) setOverBalance(false);
          }}
          disabled={balanceIsLoading}
          className="mt-1 inline-flex items-center rounded-full border border-black/15 bg-black/5 px-3 py-1 text-xs font-semibold text-gray-500 transition active:translate-y-0.5 hover:bg-black/10 disabled:opacity-60"
        >
          {balanceIsLoading ? (
            <span className="h-3 w-20 rounded bg-black/10 animate-pulse" />
          ) : (
            `${t('withdraw.available', 'Available')}: $${available.toFixed(2)}`
          )}
        </button>
      </div>

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

      <AmountKeypad
        value={amount}
        onValueChange={(next) => {
          setAmount(next);
          if (overBalance) setOverBalance(false);
        }}
        maxDecimals={2}
        compact
      />
    </div>
  );

  // --- Paso: confirmación ----------------------------------------------------
  const confirmStep = (
    <div className="flex flex-col gap-4">
      <div className="text-center pt-1">
        <p className="text-sm text-gray-500">{t('withdraw.amountLabel', 'Amount')}</p>
        <p className="text-4xl font-bold text-black">${numericAmount.toFixed(2)}</p>
      </div>

      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('withdraw.methodLabel', 'Method')}</span>
        <span className="font-bold text-black">{t('deposit.blend.destination', 'Blend')}</span>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-600">
        <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          {t(
            'deposit.blend.notTracked',
            'Your USDC goes straight to Blend and starts earning right away. This deposit is not tracked as a Vaquita lock.',
          )}
        </p>
      </div>

      {error ? <p className="text-sm text-error font-semibold">{error}</p> : null}
    </div>
  );

  // --- Pasos: procesando / éxito --------------------------------------------
  const processingStep = (
    <div className="flex flex-col items-center justify-center gap-4 py-10">
      <Spinner size="lg" color="accent" />
      <p className="text-base font-bold text-black">
        {t('deposit.blend.processing', 'Processing deposit...')}
      </p>
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
      <p className="text-lg font-bold text-black">
        {t('deposit.blend.success.title', 'Deposit sent!')}
      </p>
      <p className="text-sm text-gray-500 text-center">
        {t('deposit.blend.success.subtitle', 'Your USDC is now earning in Blend.')}
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
    step === 'method' ? (
      <PressableButton variant="success" size="cta" onClick={onContinue}>
        {t('deposit.method.continue', 'I already have USDC, continue')}
      </PressableButton>
    ) : step === 'amount' ? (
      // El aviso de red va acá abajo (y no en el body) porque el teclado ya lo
      // empuja fuera de la vista: pegado al CTA se lee justo cuando el usuario
      // descubre que el botón no responde.
      <div className="flex w-full flex-col gap-2">
        <PressableButton
          variant="success"
          size="cta"
          className="py-3.5"
          onClick={handleReview}
          disabled={!canReview}
        >
          {t('withdraw.review', 'Review')}
        </PressableButton>
        {!isMainnet ? (
          <div className="flex items-start justify-center gap-1.5 text-xs text-gray-500">
            <FiAlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              {t(
                'deposit.blend.mainnetOnly',
                'Direct Blend deposits are only available on Stellar mainnet.',
              )}
            </p>
          </div>
        ) : null}
      </div>
    ) : step === 'confirm' ? (
      <PressableButton variant="success" size="cta" className="py-3.5" onClick={handleConfirm}>
        {t('deposit.blend.cta', 'Deposit to Blend')}
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
      // Durante la transacción el sheet no se puede cerrar ni volver atrás.
      isDismissable={step !== 'processing'}
      hideClose={step === 'processing'}
      onBack={backTarget ? () => setStep(backTarget) : undefined}
      bodyClassName={'flex flex-col gap-3 ' + (footer ? 'pb-2' : 'pb-6')}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}
