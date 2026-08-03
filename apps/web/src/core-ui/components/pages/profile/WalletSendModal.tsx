'use client';

import { Spinner, toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { StrKey } from '@stellar/stellar-sdk';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { blendConfigForToken, directUsdcTransfer } from '@/networks/stellar/blendDirect';
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
 * El envío va por `directUsdcTransfer` (transfer del SAC, patrocinado por Pollar),
 * así que funciona aunque la wallet no tenga XLM.
 */
export function WalletSendModal({ open, onOpenChange, address, token }: WalletSendModalProps) {
  const { t } = useTranslation();
  const { walletBalance, refreshWalletBalance } = usePollar();

  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
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
  }

  // Refrescar el balance al abrir SÍ es trabajo de efecto: sincroniza con un
  // sistema externo (el RPC) para mostrar el disponible al día.
  useEffect(() => {
    if (open) void refreshWalletBalance();
  }, [open, refreshWalletBalance]);

  const trimmedDest = destination.trim();
  const destValid =
    (StrKey.isValidEd25519PublicKey(trimmedDest) || StrKey.isValidMed25519PublicKey(trimmedDest)) &&
    trimmedDest !== address;
  const destError = trimmedDest.length > 0 && !destValid;

  const amountNum = Number(amount);
  const amountValid = amount !== '' && amountNum > 0 && amountNum <= available;
  const amountError = amount !== '' && amountNum > 0 && amountNum > available;

  const canSend = destValid && amountValid && !sending && !!address;

  const handleMax = () => {
    if (available > 0) setAmount(String(available));
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await directUsdcTransfer({ from: address, to: trimmedDest, amount, decimals });
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
      isDismissable={!sending}
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
              amount: available.toLocaleString(undefined, { maximumFractionDigits: 2 }),
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
          placeholder={t('wallet.send.destinationPlaceholder', 'G…')}
          disabled={sending}
          spellCheck={false}
          autoComplete="off"
          className={
            'w-full rounded-lg border bg-white px-4 py-3 text-sm font-mono text-black outline-none placeholder:text-gray-400 ' +
            (destError ? 'border-error border-b-2' : 'border-black border-b-2')
          }
        />
        {destError && (
          <p className="mt-1 text-xs text-error">
            {trimmedDest === address
              ? t('wallet.send.sameAddress', "You can't send to your own address.")
              : t('wallet.send.invalidAddress', "That doesn't look like a valid Stellar address.")}
          </p>
        )}
      </div>
    </AppModal>
  );
}
