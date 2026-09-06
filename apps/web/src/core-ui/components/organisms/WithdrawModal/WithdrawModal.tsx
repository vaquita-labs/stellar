'use client';

import { truncateMiddle } from '@/core-ui/helpers/strings';
import { AMOUNT_DECIMALS, floorAmount, formatTokenPrecise, formatUsdPrecise, MIN_USDC } from '@/core-ui/helpers/numbers';
import { useLivePassiveUsdc, usePassiveLabel, usePassiveMigration } from '@/core-ui/hooks';
import { useUsdcTrustline } from '@/core-ui/hooks/useUsdcTrustline';
import { blendConfigForToken } from '@/networks/stellar/blendDirect';
import { Spinner } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BsBank2 } from 'react-icons/bs';
import { FiAtSign, FiCheck, FiChevronRight, FiPlus } from 'react-icons/fi';
import { HiOutlineSelector } from 'react-icons/hi';
import { IoWalletOutline } from 'react-icons/io5';
import { useProfileData } from '../../../hooks';
import { SavedWallet, useDeleteSavedWallet, useSavedWallets } from '../../../hooks/useSavedWallets';
import { useConfigStore } from '../../../stores';
import { AmountStep, useAmountShake } from '../../molecules/AmountStep';
import { AppModal } from '../../molecules/AppModal';
import { ErrorNotice } from '../../molecules/ErrorNotice';
import { AddNicknameForm } from './AddNicknameForm';
import { AddWalletForm } from './AddWalletForm';
import { WalletRow } from './WalletRow';
import { WithdrawModalProps, WithdrawProgressStep, WithdrawStep } from './types';
import { PressableButton } from '../../molecules/PressableButton';

/**
 * Flujo de retiro del home. Retira de BLEND (nivel líquido normal), y lo que
 * decide la forma del retiro es A DÓNDE va la plata, no con qué wallet entró:
 *   - A la wallet propia: un salto. El pool le paga al firmante, así que sacarla
 *     de Blend ya la deja donde tiene que estar. Es lo que hace "Wallet" con
 *     login externo, y ahí el destino es fijo, sin selector.
 *   - A la de otro: dos saltos. Primero sale de Blend a la wallet del usuario y
 *     de ahí se le paga al destino, porque el pool no puede pagarle a un tercero.
 *
 * Los dos saltos NO son atómicos: entre uno y otro la plata está en la wallet
 * del que retira. Por eso se verifica antes de firmar nada que el destino pueda
 * recibir el USDC, y si aun así el pago falla el error dice dónde quedó
 * (`WithdrawPaymentError`) en vez de reportar un retiro que no pasó.
 *
 * La rama "Bank" es el off-ramp a fiat, y "Username" nombra al destino por
 * usuario de Vaquita en vez de por dirección. Va para cualquier tipo de login:
 * mandarle a una persona son dos saltos venga de donde venga.
 */
export function WithdrawModal({ open, onOpenChange, onSubmit, onOfframp }: WithdrawModalProps) {
  const { t } = useTranslation();
  const { walletAddress, token } = useConfigStore();
  const { wallet } = usePollar();
  const { data: profile } = useProfileData();
  const savvy = !!profile?.cryptoSavvy;
  // Withdrawable balance: the vault position when the passive-vault flag is on
  // (funds migrated out of Blend), else the legacy Blend position. The withdraw
  // action itself routes accordingly via passiveWithdraw.
  const { live: primaryLiveUsdc, vaultOn } = useLivePassiveUsdc(walletAddress);
  const passiveLabel = usePassiveLabel();
  // Leftover legacy Blend balance (should be 0 after migration): surfaced with its
  // own withdraw button so a user who still holds Blend can pull it out.
  const { blendBalance, hasBorrow, withdrawToWallet } = usePassiveMigration(walletAddress);
  const showBlendLeftover = vaultOn && blendBalance > 0;
  const [blendBusy, setBlendBusy] = useState(false);
  // Guardamos el error TAL CUAL: `ErrorNotice` lo humaniza, y aplastarlo a
  // `.message` acá descartaría los errores tipados que ese mapeo reconoce.
  const [blendError, setBlendError] = useState<unknown>(null);
  const { data: savedWallets = [], isLoading: walletsLoading } = useSavedWallets();
  const deleteWallet = useDeleteSavedWallet();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Login externo (Freighter/xBull) vs custodial/social (Pollar interno).
  const isExternalWallet = wallet?.custody === 'external';
  const ownAddress = wallet?.address ?? walletAddress ?? '';

  const [step, setStep] = useState<WithdrawStep>('method');
  const [amount, setAmount] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  // Cuál de las dos listas de destino se está usando. Por abajo es lo mismo —lo
  // guardado siempre es una dirección—, pero decide a qué lista vuelve el
  // selector del paso del monto y dónde termina el back del alta.
  const [destinationKind, setDestinationKind] = useState<'wallet' | 'username'>('wallet');
  // A la lista de usuarios se entra por dos lados —desde "Elegir método", antes
  // de tipear nada, y desde el selector de destino del paso del monto—, así que
  // el back se guarda al entrar en vez de adivinarlo desde el estado.
  const [usernameOrigin, setUsernameOrigin] = useState<WithdrawStep>('method');
  // Guardamos el error TAL CUAL: `ErrorNotice` lo humaniza, y aplastarlo a
  // `.message` acá descartaría los errores tipados que ese mapeo reconoce.
  const [error, setError] = useState<unknown>(null);
  // Se enciende cuando el usuario intenta revisar un monto mayor al disponible:
  // apaga el número, lo hace temblar, escribe el motivo donde estaba el mínimo y
  // bloquea Review. Se apaga al seguir tecleando (o al tocar Available / cambiar
  // de wallet).
  const [overBalance, setOverBalance] = useState(false);
  // Tocó "Available" (retirar todo): dispara el sentinel i128 de blendDirect.
  const [isMax, setIsMax] = useState(false);
  // Salto en curso durante el "processing" (para el progreso animado).
  const [activeStep, setActiveStep] = useState<WithdrawProgressStep | null>(null);
  const { controls: amountControls, shake } = useAmountShake();

  // Saldo retirable = la posición pasiva (líquida, sin lock: vault de DeFindex o
  // Blend según el flag), proyectada en vivo con `useLivePassiveUsdc` (la MISMA
  // fuente que el header, así el saldo de arriba y el "Available" corren juntos y
  // coinciden). Piso a 7 decimales (nunca hacia arriba) para no aparentar plata
  // que no existe.
  const available = floorAmount(primaryLiveUsdc, AMOUNT_DECIMALS);

  const handleBlendWithdraw = async () => {
    setBlendBusy(true);
    setBlendError(null);
    try {
      await withdrawToWallet();
    } catch (e) {
      setBlendError(e ?? new Error(t('withdraw.error.generic', 'Something went wrong')));
    } finally {
      setBlendBusy(false);
    }
  };

  // Wallet propia sintética (login externo): el retiro vuelve al firmante.
  const ownWallet: SavedWallet | null =
    isExternalWallet && ownAddress
      ? {
          id: 'self',
          label: t('withdraw.ownWallet', 'Your wallet'),
          address: ownAddress,
          network: 'stellar',
          memo: null,
          createdTimestamp: 0,
          updatedTimestamp: 0,
        }
      : null;

  // Las dos listas salen de la misma tabla: `AddNicknameForm` guarda el destino
  // con el `@` adelante en el label, y es lo único que distingue "le mando a una
  // persona" de "le mando a una cuenta". Si alguien le pone `@algo` de nombre a
  // una dirección, aparece entre los usuarios: sigue siendo un destino suyo,
  // elegible, sólo que listado del otro lado.
  const usernameWallets = savedWallets.filter((w) => w.label.startsWith('@'));
  const addressWallets = savedWallets.filter((w) => !w.label.startsWith('@'));

  const selectedWallet = savedWallets.find((w) => w.id === selectedWalletId) ?? null;
  // Destino efectivo. Mandarle a un usuario es elegir a OTRO, así que ahí manda
  // lo elegido incluso con wallet externa; el resto del tiempo la externa cobra
  // en la suya (el pool le paga al firmante) y la social elige de su lista.
  const destination = destinationKind === 'username' ? selectedWallet : (ownWallet ?? selectedWallet);

  // ¿El destino es uno mismo? Es lo que decide cuántos saltos hace el retiro:
  // a la propia wallet alcanza con sacar de Blend, a la de otro hay que sacar y
  // después pagarle. No es lo mismo que el tipo de login — una wallet externa
  // mandándole a un usuario también son dos saltos.
  const destinationIsSelf = !!destination && !!ownAddress && destination.address === ownAddress;

  // ¿La cuenta destino puede RECIBIR el USDC? Un pago clásico a una cuenta sin
  // trustline rebota con `op_no_trust`, y para entonces la plata ya salió de
  // Blend: queda en la wallet del que retira, con el retiro marcado como
  // fallido. Por eso se chequea ANTES de firmar nada. Mismo criterio que el
  // Send de la wallet (`WalletSendModal`).
  const destTrustline = useUsdcTrustline(
    destinationIsSelf ? null : (destination?.address ?? null),
    blendConfigForToken(token)?.usdcIssuer,
  );
  const destCannotReceive = destTrustline.data === 'missing' || destTrustline.data === 'unfunded';
  // Si Horizon no contesta no se bloquea: su caída no puede dejar el retiro
  // inservible, y el pago igual rebotaría antes de mover nada del salto 2.
  const destCheckFailed = !!destination && !destinationIsSelf && destTrustline.isError;
  const destChecking = !!destination && !destinationIsSelf && destTrustline.isLoading;

  // Pasos visibles del retiro, según a dónde va la plata y no según el login:
  // a la wallet propia es 1 salto (el pool le paga al firmante), a la de otro
  // son 2 (sacar de Blend → pagarle). Copy humano por default; con
  // `cryptoSavvy` mostramos el detalle on-chain (menciona Blend).
  const progressSteps: { key: WithdrawProgressStep; label: string }[] = destinationIsSelf
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

  // Cada apertura arranca limpia.
  useEffect(() => {
    if (open) {
      setStep('method');
      setDestinationKind('wallet');
      setUsernameOrigin('method');
      setAmount('');
      setError(null);
      setOverBalance(false);
      setIsMax(false);
      setActiveStep(null);
    }
  }, [open]);

  // Preselección (social): la primera wallet guardada, salvo que ya haya
  // elegido. Mandarle a un usuario queda afuera: ahí el destino es una persona
  // y elegirla por él sería elegir a quién le manda la plata.
  useEffect(() => {
    if (destinationKind === 'username') return;
    if (isExternalWallet || selectedWalletId) return;
    // Se filtra acá adentro: `addressWallets` es un array nuevo en cada render y
    // como dependencia volvería a disparar el efecto sin que cambie nada.
    const first = savedWallets.find((w) => !w.label.startsWith('@'));
    if (first) setSelectedWalletId(first.id);
  }, [destinationKind, isExternalWallet, savedWallets, selectedWalletId]);

  const numericAmount = Number(amount || '0');
  // Mínimo 1 USDC para retirar (mismo piso que el depósito y que valida el
  // backend). Por debajo el botón queda gris y el aviso de mínimo lo explica.
  // Exceder el saldo se detecta al presionar Review: tiembla + número en rojo
  // y el botón queda bloqueado hasta que modifique el monto (tecleo/Available/
  // cambio de wallet apagan `overBalance`). Faltar destino sí navega a elegirlo.
  const canReview = numericAmount >= MIN_USDC && !overBalance;

  const shakeAmount = () => {
    setOverBalance(true);
    shake();
  };

  const handleReview = () => {
    if (numericAmount > available) {
      shakeAmount();
      return;
    }
    // Monto válido pero sin destino (social sin wallet elegida): elegir/crear.
    if (!destination) {
      setUsernameOrigin('amount');
      setStep(destinationKind === 'username' ? 'username' : 'account');
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
      setError(e ?? new Error(t('withdraw.error.generic', 'Something went wrong')));
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
      <PressableButton
        variant="white"
        size="row"
        onClick={() => {
          setDestinationKind('wallet');
          setStep('amount');
        }}
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
      </PressableButton>

      {/* Mandarle a un usuario de Vaquita es su propio método, no una opción
          escondida adentro de "Wallet": el que se la manda a una persona no
          está pensando en direcciones ni en redes, y no tiene por qué pasar por
          una pantalla que le pide eso.

          Va para cualquier login. Con wallet externa el pool le paga al
          firmante, así que la plata pasa primero por la suya y recién de ahí
          sale el pago al destinatario: dos saltos, los mismos que hace la
          social. */}
      <PressableButton
        variant="white"
        size="row"
        onClick={() => {
          setDestinationKind('username');
          setUsernameOrigin('method');
          setStep('username');
        }}
      >
        <FiAtSign className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('withdraw.method.username.title', 'Username')}
          </span>
          <span className="block text-xs text-gray-500">
            {t('withdraw.method.username.subtitle', 'Send to a Vaquita user')}
          </span>
        </span>
      </PressableButton>
    </div>
  );

  // --- Paso: monto -----------------------------------------------------------
  const amountStep = (
    <AmountStep
      value={amount}
      onValueChange={(next) => {
        setAmount(next);
        setIsMax(false);
      }}
      decimals={AMOUNT_DECIMALS}
      size="lg"
      controls={amountControls}
      available={available}
      // Tocar "Available" es pedir retirar TODO: el sentinel i128 de blendDirect
      // depende de esta bandera, no del monto tecleado.
      onMax={() => setIsMax(true)}
      error={overBalance ? t('withdraw.exceedsBalance', "That's more than you have available.") : null}
      onErrorClear={() => setOverBalance(false)}
      hint={t('withdraw.minWithdraw', 'Minimum withdrawal: {{amount}} USDC.', {
        amount: formatTokenPrecise(MIN_USDC, 2),
      })}
    >
      {showBlendLeftover && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-black/15 bg-black/5 px-3 py-2">
          <span className="text-sm text-gray-600">
            {t('withdraw.blendLeftover', 'In Blend')}: {formatUsdPrecise(blendBalance)}
          </span>
          <div className="flex flex-col items-end">
            <PressableButton
              variant="white"
              size="chip"
              disabled={hasBorrow || blendBusy}
              onClick={() => void handleBlendWithdraw()}
            >
              {blendBusy
                ? t('withdraw.withdrawing', 'Withdrawing…')
                : t('withdraw.withdrawFromBlend', 'Withdraw from Blend')}
            </PressableButton>
            {hasBorrow && (
              <span className="mt-1 text-[11px] text-warning">
                {t('withdraw.blendBorrow', 'Repay your Blend borrow first')}
              </span>
            )}
          </div>
        </div>
      )}
      {blendError ? <ErrorNotice error={blendError} /> : null}

      {isExternalWallet && destinationKind !== 'username' ? (
        // Externa cobrando en la suya: destino fijo, sin selector. Eligiendo un
        // usuario sí hay a quién elegir, y ahí va el mismo selector que la social.
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
            setUsernameOrigin('amount');
            setStep(destinationKind === 'username' ? 'username' : 'account');
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
                {selectedWallet.memo ? (
                  <span className="block text-xs text-gray-400 truncate">
                    {t('withdraw.memoLabel', 'Memo')}: {selectedWallet.memo}
                  </span>
                ) : null}
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
    </AmountStep>
  );

  // Placeholder de carga, igual para las dos listas de destino.
  const walletSkeleton = Array.from({ length: 2 }).map((_, i) => (
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
  ));

  // --- Paso: elegir cuenta (social) ------------------------------------------
  const accountStep = (
    <div className="flex flex-col gap-2">
      {addressWallets.map((w) => (
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

      {walletsLoading && addressWallets.length === 0 ? walletSkeleton : null}

      {addressWallets.length === 0 && !walletsLoading ? (
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

  // --- Paso: elegir usuario (social) -----------------------------------------
  // Misma forma que la lista de wallets, con lo que corresponde a una persona:
  // el alta pide un `@usuario` y no una dirección, y el vacío no habla de
  // wallets guardadas.
  const usernameStep = (
    <div className="flex flex-col gap-2">
      {usernameWallets.map((w) => (
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

      {walletsLoading && usernameWallets.length === 0 ? walletSkeleton : null}

      {usernameWallets.length === 0 && !walletsLoading ? (
        <p className="text-sm text-gray-500 text-center py-4">
          {t('withdraw.noUsernames', 'You have no saved users yet')}
        </p>
      ) : null}

      <div className="border-t border-black/10 my-1" />

      <PressableButton variant="white" size="row" onClick={() => setStep('addNickname')}>
        <FiAtSign className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 text-sm font-bold text-black">
          {t('withdraw.addNickname.cta', 'Add username')}
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
        <span className="font-bold text-black">{passiveLabel}</span>
      </div>

      {destination ? (
        <div className="flex items-center gap-3">
          <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-black truncate">{destination.label}</p>
            <p className="text-xs text-gray-500">{truncateMiddle(destination.address, 6, 5)}</p>
            {destination.memo ? (
              <p className="text-xs text-gray-400 truncate">
                {t('withdraw.memoLabel', 'Memo')}: {destination.memo}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Se avisa ACÁ, antes de firmar. Si el destino no puede recibir el USDC,
          el pago del salto 2 rebota con `op_no_trust` y para entonces la plata
          ya salió de Blend: le queda al que retira, con el retiro en error. */}
      {destChecking ? (
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <Spinner size="sm" color="current" />
          {t('withdraw.dest.checking', 'Checking that account can receive USDC…')}
        </p>
      ) : destTrustline.data === 'unfunded' ? (
        <p className="text-xs text-error">
          {t('withdraw.dest.unfunded', "That account isn't active on Stellar yet, so it can't receive USDC.")}
        </p>
      ) : destTrustline.data === 'missing' ? (
        <p className="text-xs text-error">
          {t(
            'withdraw.dest.noTrustline',
            "This account hasn't enabled USDC yet. Ask them to open the app once, then try again.",
          )}
        </p>
      ) : destCheckFailed ? (
        <p className="text-xs text-gray-500">
          {t('withdraw.dest.checkFailed', "We couldn't check that account. You can still try withdrawing.")}
        </p>
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
    username: usernameStep,
    addWallet: (
      <AddWalletForm
        onCreated={(w: SavedWallet) => {
          setSelectedWalletId(w.id);
          setStep('amount');
        }}
      />
    ),
    addNickname: (
      <AddNicknameForm
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
    username: t('withdraw.selectUsername', 'Select user'),
    addWallet: t('withdraw.addMethod', 'Add method'),
    addNickname: t('withdraw.addNickname.cta', 'Add username'),
    confirm: t('withdraw.confirm.title', 'Confirm withdrawal'),
    processing: t('deposit.withdraw.button', 'Withdraw'),
    success: t('deposit.withdraw.button', 'Withdraw'),
  };

  // El back de cada paso. `processing` no vuelve atrás: la transacción ya salió.
  const BACK_TARGET: Partial<Record<WithdrawStep, WithdrawStep>> = {
    amount: 'method',
    account: 'amount',
    addWallet: 'account',
    // El alta por usuario ahora se abre desde su propia lista, no desde la de
    // wallets: el back tiene que devolver ahí.
    addNickname: 'username',
    confirm: 'amount',
  };
  const backTarget: WithdrawStep | undefined =
    step === 'username' ? usernameOrigin : BACK_TARGET[step];

  const footer =
    step === 'amount' ? (
      <PressableButton variant="success" size="cta" className="py-2.5!" onClick={handleReview} disabled={!canReview}>
        {t('withdraw.review', 'Review')}
      </PressableButton>
    ) : step === 'confirm' ? (
      <PressableButton
        variant="success"
        size="cta"
        className="py-2.5!"
        onClick={handleConfirm}
        // Bloqueado mientras no se sepa que el destino puede recibir, y también
        // cuando ya se sabe que no: firmar ahí saca la plata de Blend para que
        // el pago rebote después.
        disabled={destChecking || destCannotReceive}
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
      // Regla de todos los flujos de plata: no se cierran tocando afuera en
      // NINGÚN paso. Un toque al borde a mitad de tipear el monto o de elegir
      // destino borra todo lo hecho, y el borde es lo más fácil de tocar sin
      // querer con el sheet ocupando media pantalla. La X es el único cierre, y
      // ahí sí es deliberado.
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
