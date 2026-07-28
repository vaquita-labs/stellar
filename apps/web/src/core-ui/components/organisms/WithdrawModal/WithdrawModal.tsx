'use client';

import { truncateMiddle } from '@/core-ui/helpers/strings';
import { AMOUNT_DECIMALS, floorAmount, formatUsdPrecise, truncatedAmountString } from '@/core-ui/helpers/numbers';
import { useLiveBlendUsdc } from '@/core-ui/hooks';
import { Spinner } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { motion, useAnimationControls } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BsBank2 } from 'react-icons/bs';
import { FiCheck, FiChevronRight, FiPlus } from 'react-icons/fi';
import { HiOutlineSelector } from 'react-icons/hi';
import { IoWalletOutline } from 'react-icons/io5';
import { useProfileData } from '../../../hooks';
import { SavedWallet, useDeleteSavedWallet, useSavedWallets } from '../../../hooks/useSavedWallets';
import { useConfigStore } from '../../../stores';
import { AmountKeypad } from '../../molecules/AmountKeypad';
import { AppModal } from '../../molecules/AppModal';
import { ErrorNotice } from '../../molecules/ErrorNotice';
import { AddWalletForm } from './AddWalletForm';
import { WalletRow } from './WalletRow';
import { WithdrawModalProps, WithdrawProgressStep, WithdrawStep } from './types';
import { PressableButton } from '../../molecules/PressableButton';

/** Formatea el monto tecleado tal cual lo escribe el usuario ('' → $0.00, '1.' → $1.). */
function displayAmount(raw: string) {
  if (raw === '') return '$0.00';
  return `$${raw}`;
}

/**
 * Flujo de retiro del home. Retira de BLEND (nivel líquido normal), y el destino
 * depende del tipo de login:
 *   - Wallet EXTERNA (Freighter): el retiro vuelve a la wallet conectada (el pool
 *     paga al firmante), así que el destino es fijo, sin selector.
 *   - Social/CUSTODIAL: la plata queda en la wallet interna, así que el usuario
 *     elige una wallet EXTERNA de destino (picker de wallets guardadas). El envío
 *     real a esa dirección se cablea aparte; por ahora el picker queda restaurado.
 * La rama "Bank" es el off-ramp a fiat.
 */
export function WithdrawModal({ open, onOpenChange, onSubmit, onOfframp }: WithdrawModalProps) {
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const { wallet } = usePollar();
  const { data: profile } = useProfileData();
  const savvy = !!profile?.cryptoSavvy;
  const { live: blendLiveUsdc } = useLiveBlendUsdc(walletAddress);
  const { data: savedWallets = [], isLoading: walletsLoading } = useSavedWallets();
  const deleteWallet = useDeleteSavedWallet();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Login externo (Freighter/xBull) vs custodial/social (Pollar interno).
  const isExternalWallet = wallet?.custody === 'external';
  const ownAddress = wallet?.address ?? walletAddress ?? '';

  const [step, setStep] = useState<WithdrawStep>('method');
  const [amount, setAmount] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Se enciende cuando el usuario intenta revisar un monto mayor al disponible:
  // pinta el número en gris y dispara el temblor. Se apaga al seguir tecleando.
  const [overBalance, setOverBalance] = useState(false);
  // Tocó "Available" (retirar todo): dispara el sentinel i128 de blendDirect.
  const [isMax, setIsMax] = useState(false);
  // Salto en curso durante el "processing" (para el progreso animado).
  const [activeStep, setActiveStep] = useState<WithdrawProgressStep | null>(null);
  const amountControls = useAnimationControls();

  // Pasos visibles del retiro. Externa = 1 salto (a su wallet); social = 2
  // (preparar de Blend → enviar a la externa). Copy humano por default; con
  // `cryptoSavvy` mostramos el detalle on-chain (menciona Blend).
  const progressSteps: { key: WithdrawProgressStep; label: string }[] = isExternalWallet
    ? [
        {
          key: 'sending',
          label: savvy
            ? t('withdraw.steps.externalSavvy', 'Withdrawing from Blend to your wallet')
            : t('withdraw.steps.sending', 'Sending to your wallet'),
        },
      ]
    : [
        {
          key: 'preparing',
          label: savvy
            ? t('withdraw.steps.blendWithdraw', 'Withdrawing from Blend')
            : t('withdraw.steps.preparing', 'Getting your money ready'),
        },
        { key: 'sending', label: t('withdraw.steps.sending', 'Sending to your wallet') },
      ];

  // Saldo retirable = la posición directa en Blend (líquida, sin lock), proyectada
  // en vivo con `useLiveBlendUsdc` (la MISMA fuente que el header, así el saldo de
  // arriba y el "Available" corren juntos y coinciden). Piso a 7 decimales (nunca
  // hacia arriba) para no aparentar plata que no existe.
  const available = floorAmount(blendLiveUsdc, AMOUNT_DECIMALS);

  // Wallet propia sintética (login externo): el retiro vuelve al firmante.
  const ownWallet: SavedWallet | null =
    isExternalWallet && ownAddress
      ? {
          id: 'self',
          label: t('withdraw.ownWallet', 'Your wallet'),
          address: ownAddress,
          network: 'stellar',
          createdTimestamp: 0,
          updatedTimestamp: 0,
        }
      : null;

  const selectedWallet = savedWallets.find((w) => w.id === selectedWalletId) ?? null;
  // Destino efectivo: la propia para externos, la elegida para social.
  const destination = ownWallet ?? selectedWallet;

  // Cada apertura arranca limpia.
  useEffect(() => {
    if (open) {
      setStep('method');
      setAmount('');
      setError(null);
      setOverBalance(false);
      setIsMax(false);
      setActiveStep(null);
    }
  }, [open]);

  // Preselección (social): la primera wallet guardada, salvo que ya haya elegido.
  useEffect(() => {
    if (!isExternalWallet && !selectedWalletId && savedWallets.length > 0) {
      setSelectedWalletId(savedWallets[0].id);
    }
  }, [isExternalWallet, savedWallets, selectedWalletId]);

  const numericAmount = Number(amount || '0');
  // El botón se habilita con cualquier monto > 0. Exceder el saldo o faltar
  // destino se resuelven al presionar Review, no con un botón muerto.
  const canReview = numericAmount > 0;

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
    // Monto válido pero sin destino (social sin wallet elegida): elegir/crear.
    if (!destination) {
      setStep('account');
      return;
    }
    setStep('confirm');
  };

  // Cambio rápido de wallet con swipe vertical (o rueda) sobre el selector.
  const cycleWallet = (dir: 1 | -1) => {
    if (savedWallets.length < 2) return;
    const idx = savedWallets.findIndex((w) => w.id === selectedWalletId);
    const base = idx === -1 ? 0 : idx;
    const next = (base + dir + savedWallets.length) % savedWallets.length;
    setSelectedWalletId(savedWallets[next].id);
    if (overBalance) setOverBalance(false);
  };

  const touchStartY = useRef<number | null>(null);
  const swipedRef = useRef(false);

  const handleDeleteWallet = async (id: string) => {
    setPendingDeleteId(id);
    try {
      await deleteWallet.mutateAsync(id);
      if (selectedWalletId === id) setSelectedWalletId(null);
    } finally {
      setPendingDeleteId(null);
    }
  };

  const handleConfirm = async () => {
    if (!destination) return;
    setStep('processing');
    setError(null);
    // Arranca en el primer salto para que el spinner no aparezca "sin paso".
    setActiveStep(progressSteps[0]?.key ?? 'sending');
    try {
      await onSubmit({
        amount: numericAmount,
        withdrawAll: isMax,
        wallet: destination,
        onProgress: setActiveStep,
      });
      setStep('success');
    } catch (e) {
      setError((e as Error)?.message ?? t('withdraw.error.generic', 'Something went wrong'));
      setStep('confirm');
    }
  };

  // --- Paso: método ----------------------------------------------------------
  const methodStep = (
    <div className="flex flex-col gap-2">
      <PressableButton variant="white" size="row" onClick={onOfframp}>
        <BsBank2 className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('withdraw.method.bank.title', 'Bank')}
          </span>
          <span className="block text-xs text-gray-500">
            {t('withdraw.method.bank.subtitle', 'Withdraw to your bank account')}
          </span>
        </span>
      </PressableButton>
      <PressableButton variant="white" size="row" onClick={() => setStep('amount')}>
        <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('withdraw.method.wallet.title', 'Wallet')}
          </span>
          <span className="block text-xs text-gray-500">
            {t('withdraw.method.wallet.subtitle', 'Withdraw to a crypto wallet')}
          </span>
        </span>
      </PressableButton>
    </div>
  );

  // --- Paso: monto -----------------------------------------------------------
  const amountStep = (
    <div className="flex flex-col gap-4">
      <div className="text-center pt-1">
        <motion.p
          animate={amountControls}
          className={`text-4xl font-bold ${
            overBalance || amount === '' ? 'text-gray-400' : 'text-black'
          }`}
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
          {t('withdraw.available', 'Available')}: {formatUsdPrecise(available)}
        </button>
      </div>

      {isExternalWallet ? (
        // Externa: destino fijo (tu wallet), sin selector.
        <div className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-2.5">
          <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-black truncate">
              {t('withdraw.ownWallet', 'Your wallet')}
            </span>
            <span className="block text-xs text-gray-500">
              {ownAddress ? truncateMiddle(ownAddress, 6, 5) : '—'}
            </span>
          </span>
        </div>
      ) : (
        // Social: elegir wallet externa de destino (tap abre la lista; swipe/rueda cicla).
        <PressableButton
          variant="white"
          size="row"
          className="active:bg-[#EAF4FF] touch-pan-x select-none"
          onClick={() => {
            if (swipedRef.current) {
              swipedRef.current = false;
              return;
            }
            setStep('account');
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
              cycleWallet(dy < 0 ? 1 : -1);
            }
          }}
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > 10) cycleWallet(e.deltaY > 0 ? 1 : -1);
          }}
        >
          <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
          <span className="flex-1 min-w-0">
            {selectedWallet ? (
              <>
                <span className="block text-sm font-bold text-black truncate">{selectedWallet.label}</span>
                <span className="block text-xs text-gray-500">
                  {truncateMiddle(selectedWallet.address, 6, 5)}
                </span>
              </>
            ) : walletsLoading ? (
              <span className="block animate-pulse">
                <span className="block h-3.5 w-24 rounded bg-black/10" />
                <span className="mt-1.5 block h-3 w-32 rounded bg-black/10" />
              </span>
            ) : (
              <span className="block text-sm font-bold text-black">
                {t('withdraw.addWallet.cta', 'Add a wallet')}
              </span>
            )}
          </span>
          {walletsLoading ? (
            <span className="w-5 h-5 shrink-0 rounded bg-black/10 animate-pulse" />
          ) : (
            <HiOutlineSelector className="w-5 h-5 text-black shrink-0" />
          )}
        </PressableButton>
      )}

      <AmountKeypad
        value={amount}
        onValueChange={(next) => {
          setAmount(next);
          setIsMax(false);
          if (overBalance) setOverBalance(false);
        }}
        maxDecimals={AMOUNT_DECIMALS}
      />
    </div>
  );

  // --- Paso: elegir cuenta (social) ------------------------------------------
  const accountStep = (
    <div className="flex flex-col gap-2">
      {savedWallets.map((w) => (
        <WalletRow
          key={w.id}
          wallet={w}
          selected={w.id === selectedWalletId}
          deleting={deleteWallet.isPending && pendingDeleteId === w.id}
          onSelect={() => {
            setSelectedWalletId(w.id);
            setStep('amount');
          }}
          onDelete={() => handleDeleteWallet(w.id)}
        />
      ))}

      {walletsLoading && savedWallets.length === 0
        ? Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="w-full flex items-center gap-3 rounded-lg border border-black/10 bg-white px-4 py-3 animate-pulse"
            >
              <span className="w-6 h-6 shrink-0 rounded bg-black/10" />
              <span className="flex-1">
                <span className="block h-3.5 w-24 rounded bg-black/10" />
                <span className="mt-1.5 block h-3 w-32 rounded bg-black/10" />
              </span>
            </div>
          ))
        : null}

      {savedWallets.length === 0 && !walletsLoading ? (
        <p className="text-sm text-gray-500 text-center py-4">
          {t('withdraw.noWallets', 'You have no saved wallets yet')}
        </p>
      ) : null}

      <div className="border-t border-black/10 my-1" />

      <PressableButton variant="white" size="row" onClick={() => setStep('addWallet')}>
        <FiPlus className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 text-sm font-bold text-black">
          {t('withdraw.addMethod', 'Add method')}
        </span>
        <FiChevronRight className="w-5 h-5 text-black shrink-0" />
      </PressableButton>
    </div>
  );

  // --- Paso: confirmación ----------------------------------------------------
  const confirmStep = (
    <div className="flex flex-col gap-4">
      <div className="text-center pt-1">
        <p className="text-sm text-gray-500">{t('withdraw.amountLabel', 'Amount')}</p>
        <p className="text-4xl font-bold text-black">{formatUsdPrecise(numericAmount)}</p>
      </div>

      <div className="flex items-center justify-between text-sm border-b border-black/10 pb-2">
        <span className="text-gray-500">{t('withdraw.fromLabel', 'From')}</span>
        <span className="font-bold text-black">{t('portfolio.blend.label', 'Blend · Flexible')}</span>
      </div>

      {destination ? (
        <div className="flex items-center gap-3">
          <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-black truncate">{destination.label}</p>
            <p className="text-xs text-gray-500">{truncateMiddle(destination.address, 6, 5)}</p>
          </div>
        </div>
      ) : null}

      {error ? <ErrorNotice error={error} /> : null}
    </div>
  );

  // --- Pasos: procesando / éxito --------------------------------------------
  const activeIdx = progressSteps.findIndex((s) => s.key === activeStep);
  const processingStep = (
    <div className="flex flex-col gap-4 py-3">
      {/* Stepper vertical conectado: círculos unidos por una línea, así se lee
          como un proceso (paso 1 → paso 2). Hecho = check verde; en curso =
          spinner; pendiente = número gris. */}
      <div className="flex flex-col px-1">
        {progressSteps.map((s, i) => {
          const isActive = s.key === activeStep;
          const isDone = activeIdx > i;
          const isLast = i === progressSteps.length - 1;
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
      <p className="text-lg font-bold text-black">{t('withdraw.success.title', 'Withdrawal sent!')}</p>
      <p className="text-sm text-gray-500 text-center">
        {t('withdraw.success.subtitle', 'Your funds are on their way to {{label}}.', {
          label: destination?.label ?? '',
        })}
      </p>
    </div>
  );

  const STEP_CONTENT: Record<WithdrawStep, React.ReactNode> = {
    method: methodStep,
    amount: amountStep,
    account: accountStep,
    addWallet: (
      <AddWalletForm
        onCreated={(w: SavedWallet) => {
          setSelectedWalletId(w.id);
          setStep('amount');
        }}
      />
    ),
    confirm: confirmStep,
    processing: processingStep,
    success: successStep,
  };

  const STEP_TITLE: Record<WithdrawStep, string> = {
    method: t('withdraw.method.title', 'Select method'),
    amount: t('deposit.withdraw.button', 'Withdraw'),
    account: t('withdraw.selectAccount', 'Select account'),
    addWallet: t('withdraw.addMethod', 'Add method'),
    confirm: t('withdraw.confirm.title', 'Confirm withdrawal'),
    processing: t('deposit.withdraw.button', 'Withdraw'),
    success: t('deposit.withdraw.button', 'Withdraw'),
  };

  // El back de cada paso. `processing` no vuelve atrás: la transacción ya salió.
  const BACK_TARGET: Partial<Record<WithdrawStep, WithdrawStep>> = {
    amount: 'method',
    account: 'amount',
    addWallet: 'account',
    confirm: 'amount',
  };
  const backTarget = BACK_TARGET[step];

  const footer =
    step === 'amount' ? (
      <PressableButton variant="success" size="cta" className="py-2.5!" onClick={handleReview} disabled={!canReview}>
        {t('withdraw.review', 'Review')}
      </PressableButton>
    ) : step === 'confirm' ? (
      <PressableButton variant="success" size="cta" className="py-2.5!" onClick={handleConfirm}>
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
