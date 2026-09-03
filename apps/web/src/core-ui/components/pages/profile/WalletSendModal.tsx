'use client';

import { Spinner, toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdClose, MdOutlineStickyNote2 } from 'react-icons/md';
import { blendConfigForToken, resolveMemo, sponsoredUsdcPayment } from '@/networks/stellar/blendDirect';
import { useWalletByUsername } from '@/core-ui/hooks/profile/useWalletByUsername';
import { useUsdcTrustline } from '@/core-ui/hooks/useUsdcTrustline';
import { classifyDestination } from '../../../helpers/sendDestination';
import { formatTokenPrecise, truncatedAmountString } from '../../../helpers/numbers';
import { truncateMiddle } from '../../../helpers/strings';
import { humanizeTxError } from '../../../helpers/txError';
import type { NetworkResponseDTO } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

type Token = NetworkResponseDTO['tokens'][number];

interface WalletSendModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Dirección Stellar del usuario que envía (su wallet custodial). */
  address: string;
  /** Token activo (de la config): da símbolo, decimales e issuer del USDC. */
  token: Token | null;
}

/** Recorta el input a un número con como mucho `decimals` decimales. */
const sanitizeAmount = (raw: string, decimals: number): string => {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, decimals)}`;
};

/**
 * Modal nativo (estilo app) para ENVIAR USDC a otra dirección Stellar. Reemplaza
 * al `openSendModal` de Pollar en la pantalla Wallet, que trae otro look y, al
 * vivir fuera del portal HeroUI, no se dejaba cerrar bien. A propósito es de UN
 * SOLO token (el USDC de la red activa): no hay selector de asset ni de red.
 *
 * El envío va por `sponsoredUsdcPayment`: un PAGO CLÁSICO de Stellar patrocinado
 * por Pollar. Es clásico para que los EXCHANGES lo acrediten (con su memo), y
 * patrocinado para que funcione aunque la wallet no tenga XLM. Para una cuenta G
 * el saldo clásico y el del SAC son el mismo, así que también sirve para mandar a
 * cualquier wallet: un solo camino cubre exchanges y wallets.
 *
 * El MEMO es opcional pero clave para depósitos a exchanges (muchos lo exigen).
 * Un solo campo (como el modal de retiro): el tipo se auto-detecta —número →
 * MEMO_ID, texto → MEMO_TEXT— así el usuario no tiene que elegirlo.
 */
export function WalletSendModal({ open, onOpenChange, address, token }: WalletSendModalProps) {
  const { t } = useTranslation();
  const { walletBalance, refreshWalletBalance } = usePollar();

  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [memo, setMemo] = useState('');
  // El memo arranca colapsado (chip), igual que el modal de retiro: es opcional y
  // no queremos cargar el formulario para quien no lo necesita.
  const [memoOpen, setMemoOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const symbol = token?.symbol ?? 'USDC';
  const decimals = token?.decimals ?? 7;

  // Saldo disponible del MISMO USDC que acepta Blend (mismo issuer). En testnet
  // hay varios "USDC" de distintos issuers; sin este filtro se mostraría el que
  // no es. Misma fuente que `useIdleFunds`.
  const blendUsdcIssuer = blendConfigForToken(token)?.usdcIssuer;
  const available = useMemo(() => {
    const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];
    const usdc = blendUsdcIssuer
      ? balances.find((b) => b.code?.toUpperCase() === 'USDC' && b.issuer === blendUsdcIssuer)
      : undefined;
    return usdc ? Number(usdc.available) : 0;
  }, [walletBalance, blendUsdcIssuer]);

  // Limpiamos el formulario cada vez que cambia la visibilidad (patrón "ajustar
  // estado en render", no un efecto: evita el render en cascada que marca el
  // linter). Así ni al abrir ni al cerrar arrastra un envío anterior.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setAmount('');
    setDestination('');
    setMemo('');
    setMemoOpen(false);
  }

  // Refrescar el balance al abrir SÍ es trabajo de efecto: sincroniza con un
  // sistema externo (el RPC) para mostrar el disponible al día.
  useEffect(() => {
    if (open) void refreshWalletBalance();
  }, [open, refreshWalletBalance]);

  // Destino: una G… o un @usuario. El @ se resuelve contra la API de perfiles;
  // lo que se firma es SIEMPRE la dirección resuelta, nunca el texto tipeado.
  const parsedDest = classifyDestination(destination);
  const handle = parsedDest.kind === 'handle' ? parsedDest.value : '';
  const lookup = useWalletByUsername(handle);
  const resolving = parsedDest.kind === 'handle' && lookup.isLoading;
  const handleNotFound = parsedDest.kind === 'handle' && lookup.notFound;
  const destAddress =
    parsedDest.kind === 'address' ? parsedDest.value : parsedDest.kind === 'handle' ? lookup.walletAddress : null;

  // El auto-envío se chequea contra la dirección RESUELTA: alguien puede tipear
  // su propio @usuario, y comparar solo el texto lo dejaría pasar.
  const isSelf = !!destAddress && destAddress === address;

  // ¿La cuenta destino puede recibir USDC? Un pago clásico a una cuenta sin
  // trustline rebota con `op_no_trust`, y el mensaje que `txError` tiene para
  // eso está escrito para el que ENVÍA — acá diría exactamente lo contrario.
  const trustline = useUsdcTrustline(isSelf ? null : destAddress, blendUsdcIssuer);
  const destBlocked = trustline.data === 'missing' || trustline.data === 'unfunded';
  // Si Horizon no contesta no bloqueamos: la caída de Horizon no puede dejar la
  // pantalla inservible, y si la trustline falta igual la cadena lo rechaza —
  // con el mensaje correcto, ahora que el error del vault ya no se pierde.
  const destCheckFailed = !!destAddress && !isSelf && trustline.isError;

  const destValid = !!destAddress && !isSelf && !destBlocked;
  const destError = parsedDest.kind === 'invalid' || handleNotFound || isSelf || destBlocked;

  const amountNum = Number(amount);
  const amountValid = amount !== '' && amountNum > 0 && amountNum <= available;
  const amountError = amount !== '' && amountNum > 0 && amountNum > available;

  const trimmedMemo = memo.trim();
  const resolvedMemo = resolveMemo(memo);
  // Solo es inválido si hay algo escrito que no resuelve (texto > 28 bytes).
  const memoError = trimmedMemo.length > 0 && resolvedMemo === null;

  const canSend = destValid && amountValid && !memoError && !sending && !resolving && !!address;

  // Truncado, no `String(available)`: el float del balance puede imprimir un
  // dígito más de los que la cadena tiene, y ese monto se rechaza.
  const handleMax = () => {
    if (available > 0) setAmount(truncatedAmountString(available, decimals));
  };

  const handleSend = async () => {
    if (!canSend || !destAddress) return;
    setSending(true);
    try {
      await sponsoredUsdcPayment({
        to: destAddress,
        amount,
        memo: resolvedMemo ?? undefined,
      });
      toast.success(
        t('wallet.send.success', 'Sent {{amount}} {{symbol}}', {
          amount: amountNum.toFixed(2),
          symbol,
        }),
      );
      await refreshWalletBalance();
      onOpenChange();
    } catch (e) {
      const { title } = humanizeTxError(e, t);
      toast.danger(title);
    } finally {
      setSending(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('wallet.send.title', 'Send')}
      size="md"
      // Los flujos de plata no se cierran tocando afuera en ningún paso (ver
      // WithdrawModal): sólo la X.
      isDismissable={false}
      hideClose={sending}
      bodyClassName="flex flex-col gap-4 pb-6"
      footer={
        <PressableButton variant="success" size="cta" onClick={handleSend} disabled={!canSend}>
          {sending ? (
            <>
              <Spinner size="sm" color="current" />
              {t('wallet.send.sending', 'Sending…')}
            </>
          ) : (
            t('wallet.send.cta', 'Send')
          )}
        </PressableButton>
      }
    >
      {/* Asset fijo: un solo token (USDC de la red activa), sin selector. */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          {t('wallet.send.asset', 'Asset')}
        </label>
        <div className="w-full flex items-center justify-between rounded-lg border border-black border-b-2 bg-white px-4 py-3">
          <span className="text-sm font-semibold text-black">{symbol}</span>
          <span className="text-xs text-gray-500">
            {t('wallet.send.available', 'Available: {{amount}} {{symbol}}', {
              // Truncado: `toLocaleString` redondea hacia arriba y mostraba más
              // saldo del que hay (0,7299999 → "0,73").
              amount: formatTokenPrecise(available, 2),
              symbol,
            })}
          </span>
        </div>
      </div>

      {/* Monto + MAX. */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          {t('wallet.send.amount', 'Amount')}
        </label>
        <div
          className={
            'w-full flex items-center gap-2 rounded-lg border bg-white px-4 py-3 ' +
            (amountError ? 'border-error border-b-2' : 'border-black border-b-2')
          }
        >
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(sanitizeAmount(e.target.value, decimals))}
            placeholder="0.00"
            disabled={sending}
            className="flex-1 min-w-0 bg-transparent text-lg font-mono text-black outline-none placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={handleMax}
            disabled={sending || available <= 0}
            className="shrink-0 rounded-md border border-black border-b-2 bg-[#DDF4FF] px-2.5 py-1 text-xs font-semibold text-black transition active:translate-y-0.5 hover:bg-[#c4ecff] disabled:opacity-50"
          >
            {t('wallet.send.max', 'MAX')}
          </button>
        </div>
        {amountError && (
          <p className="mt-1 text-xs text-error">
            {t('wallet.send.insufficient', 'Not enough {{symbol}} in your wallet.', { symbol })}
          </p>
        )}
      </div>

      {/* Dirección destino (Stellar). */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          {t('wallet.send.destination', 'Destination wallet')}
        </label>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={t('wallet.send.destinationPlaceholder', 'G… or @username')}
          disabled={sending}
          spellCheck={false}
          autoComplete="off"
          className={
            'w-full rounded-lg border bg-white px-4 py-3 text-sm font-mono text-black outline-none placeholder:text-gray-400 ' +
            (destError ? 'border-error border-b-2' : 'border-black border-b-2')
          }
        />

        {/* Un solo renglón de estado bajo el campo, en este orden: primero lo que
            invalida el destino, y recién al final la confirmación. Mostrar la G…
            resuelta es el punto: lo que el usuario aprueba es la dirección. */}
        {parsedDest.kind === 'invalid' ? (
          <p className="mt-1 text-xs text-error">
            {t('wallet.send.invalidAddress', "That doesn't look like a valid Stellar address.")}
          </p>
        ) : isSelf ? (
          <p className="mt-1 text-xs text-error">
            {t('wallet.send.sameAddress', "You can't send to your own address.")}
          </p>
        ) : handleNotFound ? (
          <p className="mt-1 text-xs text-error">
            {t('wallet.send.handleNotFound', "We couldn't find that user.")}
          </p>
        ) : resolving ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            <Spinner size="sm" color="current" />
            {t('wallet.send.resolving', 'Looking up…')}
          </p>
        ) : trustline.data === 'unfunded' ? (
          <p className="mt-1 text-xs text-error">
            {t('wallet.send.destUnfunded', "That account isn't active on Stellar yet, so it can't receive USDC.")}
          </p>
        ) : trustline.data === 'missing' ? (
          <p className="mt-1 text-xs text-error">
            {t(
              'wallet.send.destNoTrustline',
              "This account hasn't enabled USDC yet. Ask them to open the app once, then try again.",
            )}
          </p>
        ) : destCheckFailed ? (
          <p className="mt-1 text-xs text-gray-500">
            {t('wallet.send.destCheckFailed', "We couldn't check that account. You can still try sending.")}
          </p>
        ) : destAddress && parsedDest.kind === 'handle' ? (
          <p className="mt-1 text-xs text-gray-500">
            <span className="font-semibold text-black">@{handle}</span>{' '}
            <span className="font-mono">{truncateMiddle(destAddress, 6, 5)}</span>
          </p>
        ) : null}
      </div>

      {/* Memo (opcional): clave para depósitos a exchanges. Colapsado es un chip
          que se despliega (acordeón), como en el modal de retiro. El tipo (text /
          id) se auto-detecta, así que es un solo campo. */}
      {!memoOpen ? (
        <button
          type="button"
          onClick={() => setMemoOpen(true)}
          disabled={sending}
          className="self-start flex items-center gap-2 rounded-full border border-black border-b-2 bg-white h-9 px-3.5 text-sm font-bold text-black hover:bg-black/5 active:border-b active:translate-y-[1px] transition disabled:opacity-50"
        >
          <MdOutlineStickyNote2 className="w-4 h-4" />
          {t('wallet.send.memo', 'Memo')}
        </button>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-600">
              {t('wallet.send.memo', 'Memo')}
            </label>
            <button
              type="button"
              onClick={() => {
                setMemoOpen(false);
                setMemo('');
              }}
              disabled={sending}
              aria-label={t('common.close', 'Close')}
              className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:bg-black/5 hover:text-black transition disabled:opacity-50"
            >
              <MdClose className="w-4 h-4" />
            </button>
          </div>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={t('wallet.send.memoPlaceholder', 'e.g. 1234567')}
            maxLength={64}
            disabled={sending}
            spellCheck={false}
            autoComplete="off"
            className={
              'w-full rounded-lg border bg-white px-4 py-3 text-sm font-mono text-black outline-none placeholder:text-gray-400 ' +
              (memoError ? 'border-error border-b-2' : 'border-black border-b-2')
            }
          />
          {memoError ? (
            <p className="mt-1 text-xs text-error">
              {t('wallet.send.memoInvalid', 'The memo is too long (max 28 characters).')}
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-400">
              {t('wallet.send.memoHint', 'Some exchanges require a memo or tag to credit your deposit.')}
            </p>
          )}
        </div>
      )}
    </AppModal>
  );
}
