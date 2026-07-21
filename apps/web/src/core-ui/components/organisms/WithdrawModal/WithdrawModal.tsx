'use client';

import { isDepositLocked } from '@/core-ui/components/home/DepositListControls';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { truncateMiddle } from '@/core-ui/helpers/strings';
import { Button, Spinner } from '@heroui/react';
import { motion, useAnimationControls } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BsBank2 } from 'react-icons/bs';
import { FiCheck, FiChevronRight, FiPlus } from 'react-icons/fi';
import { HiOutlineSelector } from 'react-icons/hi';
import { IoWalletOutline } from 'react-icons/io5';
import { useDepositsComplete } from '../../../hooks';
import { SavedWallet, useDeleteSavedWallet, useSavedWallets } from '../../../hooks/useSavedWallets';
import { useConfigStore } from '../../../stores';
import { AmountKeypad } from '../../molecules/AmountKeypad';
import { AppModal } from '../../molecules/AppModal';
import { AddWalletForm } from './AddWalletForm';
import { WalletRow } from './WalletRow';
import { WithdrawModalProps, WithdrawStep } from './types';

/** Formatea el monto tecleado tal cual lo escribe el usuario ('' → $0.00, '1.' → $1.). */
function displayAmount(raw: string) {
  if (raw === '') return '$0.00';
  return `$${raw}`;
}

/**
 * Flujo de retiro completo en un solo sheet: monto (teclado propio) → cuenta
 * destino → confirmación → estado de la transacción.
 *
 * Pasos como `useState` + `onBack` de AppModal, igual que `DepositMethodModal`;
 * así el back nativo del sheet navega hacia atrás sin encadenar modales.
 */
export function WithdrawModal({ open, onOpenChange, onSubmit, onOfframp }: WithdrawModalProps) {
  const { t } = useTranslation();
  const { walletAddress, token } = useConfigStore();
  const { data: depositsData } = useDepositsComplete(walletAddress);
  const { data: savedWallets = [], isLoading: walletsLoading } = useSavedWallets();
  const deleteWallet = useDeleteSavedWallet();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [step, setStep] = useState<WithdrawStep>('method');
  const [amount, setAmount] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Se enciende cuando el usuario intenta revisar un monto mayor al disponible:
  // pinta el número en rojo y dispara el temblor. Se apaga al seguir tecleando.
  const [overBalance, setOverBalance] = useState(false);
  const amountControls = useAnimationControls();

  // Saldo retirable = depósitos activos ya desbloqueados. Mismo criterio que la
  // lista de retiro (`isDepositLocked`), para que el techo del teclado coincida
  // con lo que el usuario ve como "listo para retirar".
  const available = useMemo(() => {
    const { activeDeposits } = getDepositsData(depositsData?.deposits ?? []);
    return activeDeposits
      .filter((deposit) => !isDepositLocked(deposit))
      .reduce((acc, deposit) => acc + deposit.amount, 0);
  }, [depositsData]);

  // Cada apertura arranca limpia.
  useEffect(() => {
    if (open) {
      setStep('method');
      setAmount('');
      setError(null);
      setOverBalance(false);
    }
  }, [open]);

  // Preselección: la primera wallet guardada, salvo que el usuario ya eligió.
  useEffect(() => {
    if (!selectedWalletId && savedWallets.length > 0) {
      setSelectedWalletId(savedWallets[0].id);
    }
  }, [savedWallets, selectedWalletId]);

  const selectedWallet = savedWallets.find((w) => w.id === selectedWalletId) ?? null;
  const numericAmount = Number(amount || '0');
  // El botón se habilita con cualquier monto > 0. Ni exceder el saldo ni la
  // falta de wallet lo deshabilitan: se resuelven al presionar Review, así el
  // usuario recibe feedback (rojo + temblor) en vez de un botón muerto.
  const canReview = numericAmount > 0;

  const shakeAmount = () => {
    setOverBalance(true);
    // Temblor corto de izquierda a derecha; vuelve a 0 al terminar.
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
    // Monto válido pero sin destino: llevar a elegir/crear wallet.
    if (!selectedWallet) {
      setStep('account');
      return;
    }
    setStep('confirm');
  };

  // Cambio rápido de wallet con swipe vertical (o rueda en desktop) sobre el
  // selector: arriba = siguiente, abajo = anterior, con wrap. Es el atajo que
  // sugiere el ícono de dobles flechas; el tap sigue abriendo la lista completa.
  const cycleWallet = (dir: 1 | -1) => {
    if (savedWallets.length < 2) return;
    const idx = savedWallets.findIndex((w) => w.id === selectedWalletId);
    const base = idx === -1 ? 0 : idx;
    const next = (base + dir + savedWallets.length) % savedWallets.length;
    setSelectedWalletId(savedWallets[next].id);
    if (overBalance) setOverBalance(false);
  };

  const touchStartY = useRef<number | null>(null);
  // Si el gesto fue un swipe, se marca para que el onClick no abra la lista.
  const swipedRef = useRef(false);

  const handleDeleteWallet = async (id: string) => {
    setPendingDeleteId(id);
    try {
      await deleteWallet.mutateAsync(id);
      // Si se borró la wallet elegida, se deselecciona para no retirar a una
      // dirección que ya no existe.
      if (selectedWalletId === id) setSelectedWalletId(null);
    } finally {
      setPendingDeleteId(null);
    }
  };

  const handleConfirm = async () => {
    if (!selectedWallet) return;
    setStep('processing');
    setError(null);
    try {
      await onSubmit({ amount: numericAmount, wallet: selectedWallet });
      setStep('success');
    } catch (e) {
      setError((e as Error)?.message ?? t('withdraw.error.generic', 'Something went wrong'));
      setStep('confirm');
    }
  };

  const ctaClasses =
    'w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md text-black disabled:opacity-50';

  // --- Paso: método ----------------------------------------------------------
  // Banco va primero a propósito: el público objetivo no es web3 y "sacar la
  // plata al banco" es la salida que entiende sin explicación. "Wallet" queda
  // segundo para quien sí maneja cripto.
  const methodStep = (
    <>
      <button
        type="button"
        onClick={onOfframp}
        className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3 text-left hover:bg-[#F5FBFF] transition"
      >
        <BsBank2 className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('withdraw.method.bank.title', 'Bank')}
          </span>
          <span className="block text-xs text-gray-500">
            {t('withdraw.method.bank.subtitle', 'Withdraw to your bank account')}
          </span>
        </span>
        <FiChevronRight className="w-5 h-5 text-black shrink-0" />
      </button>
      <button
        type="button"
        onClick={() => setStep('amount')}
        className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3 text-left hover:bg-[#F5FBFF] transition"
      >
        <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('withdraw.method.wallet.title', 'Wallet')}
          </span>
          <span className="block text-xs text-gray-500">
            {t('withdraw.method.wallet.subtitle', 'Withdraw to a crypto wallet')}
          </span>
        </span>
        <FiChevronRight className="w-5 h-5 text-black shrink-0" />
      </button>
    </>
  );

  // --- Paso: monto -----------------------------------------------------------
  const amountStep = (
    <div className="flex flex-col gap-4">
      <div className="text-center pt-1">
        <motion.p
          animate={amountControls}
          // Al exceder el saldo el número se apaga a gris plomo (lectura de
          // "no disponible"), sin el rojo agresivo del estado de error.
          className={`text-4xl font-bold ${
            overBalance ? 'text-gray-400' : amount === '' ? 'text-gray-400' : 'text-black'
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
          className="mt-1 inline-flex items-center rounded-full border border-black/15 bg-black/5 px-3 py-1 text-xs font-semibold text-gray-500 transition active:translate-y-0.5 hover:bg-black/10"
        >
          {t('withdraw.available', 'Available')}: ${available.toFixed(2)}
        </button>
      </div>

      <button
        type="button"
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
            cycleWallet(dy < 0 ? 1 : -1); // swipe hacia arriba = siguiente
          }
        }}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > 10) cycleWallet(e.deltaY > 0 ? 1 : -1);
        }}
        className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3 text-left transition hover:bg-[#F5FBFF] active:bg-[#EAF4FF] touch-pan-x select-none"
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
          ) : (
            <span className="block text-sm font-bold text-black">
              {walletsLoading
                ? t('common.loading', 'Loading...')
                : t('withdraw.addWallet.cta', 'Add a wallet')}
            </span>
          )}
        </span>
        <HiOutlineSelector className="w-5 h-5 text-black shrink-0" />
      </button>

      <AmountKeypad
        value={amount}
        onValueChange={(next) => {
          setAmount(next);
          if (overBalance) setOverBalance(false);
        }}
        maxDecimals={2}
      />
    </div>
  );

  // --- Paso: elegir cuenta ---------------------------------------------------
  const accountStep = (
    <div className="flex flex-col gap-2">
      {savedWallets.map((wallet) => (
        <WalletRow
          key={wallet.id}
          wallet={wallet}
          selected={wallet.id === selectedWalletId}
          deleting={deleteWallet.isPending && pendingDeleteId === wallet.id}
          onSelect={() => {
            setSelectedWalletId(wallet.id);
            setStep('amount');
          }}
          onDelete={() => handleDeleteWallet(wallet.id)}
        />
      ))}

      {savedWallets.length === 0 && !walletsLoading ? (
        <p className="text-sm text-gray-500 text-center py-4">
          {t('withdraw.noWallets', 'You have no saved wallets yet')}
        </p>
      ) : null}

      <div className="border-t border-black/10 my-1" />

      <button
        type="button"
        onClick={() => setStep('addWallet')}
        className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3 text-left hover:bg-[#F5FBFF] transition"
      >
        <FiPlus className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 text-sm font-bold text-black">
          {t('withdraw.addMethod', 'Add method')}
        </span>
        <FiChevronRight className="w-5 h-5 text-black shrink-0" />
      </button>
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
        <span className="font-bold text-black">{t('withdraw.methodWallet', 'Wallet')}</span>
      </div>

      {selectedWallet ? (
        <div className="flex items-center gap-3">
          <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-black truncate">{selectedWallet.label}</p>
            <p className="text-xs text-gray-500">{truncateMiddle(selectedWallet.address, 6, 5)}</p>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-error font-semibold">{error}</p> : null}
    </div>
  );

  // --- Pasos: procesando / éxito --------------------------------------------
  const processingStep = (
    <div className="flex flex-col items-center justify-center gap-4 py-10">
      <Spinner size="lg" color="accent" />
      <p className="text-base font-bold text-black">{t('withdraw.processing', 'Processing withdrawal...')}</p>
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
        <motion.span
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <FiCheck className="w-10 h-10 text-black" strokeWidth={3} />
        </motion.span>
      </motion.div>
      <p className="text-lg font-bold text-black">{t('withdraw.success.title', 'Withdrawal sent!')}</p>
      <p className="text-sm text-gray-500 text-center">
        {t('withdraw.success.subtitle', 'Your funds are on their way to {{label}}.', {
          label: selectedWallet?.label ?? '',
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
        onCreated={(wallet: SavedWallet) => {
          setSelectedWalletId(wallet.id);
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
      <Button onPress={handleReview} isDisabled={!canReview} className={ctaClasses}>
        {t('withdraw.review', 'Review')}
      </Button>
    ) : step === 'confirm' ? (
      <Button onPress={handleConfirm} className={ctaClasses}>
        {t('withdraw.confirmCta', 'Confirm')}
      </Button>
    ) : step === 'success' ? (
      <Button onPress={onOpenChange} className={ctaClasses}>
        {t('common.done', 'Done')}
      </Button>
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
      // Sin footer el body es lo último del sheet, así que necesita el respiro
      // que normalmente aporta el footer; con footer alcanza un padding chico.
      bodyClassName={'flex flex-col gap-3 ' + (footer ? 'pb-2' : 'pb-6')}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}
