'use client';

import { formatTokenPrecise, formatUsdPrecise, MIN_IDLE_USDC, MIN_IDLE_USDC_DECIMALS } from '@/core-ui/helpers/numbers';
import { truncateMiddle } from '@/core-ui/helpers/strings';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiCheck, FiCopy } from 'react-icons/fi';
import QRCode from 'react-qr-code';
import { useWalletUsdc } from '../../../hooks/useWalletUsdc';
import { AppModal } from '../../molecules/AppModal';

/**
 * How much the balance has to rise to count as an arrival rather than the noise
 * of a last decimal. Below the floor the app can invest there would be nothing
 * to offer anyway, so it is the same number.
 */
const ARRIVAL_FLOOR = MIN_IDLE_USDC;

/** How long the notice stays up before the sheet closes itself. */
const ARRIVED_CLOSE_MS = 2_400;

interface ReceiveModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Dirección Stellar del usuario a la que recibir USDC (su wallet custodial). */
  address: string;
}

/**
 * Modal nativo (estilo app) para RECIBIR USDC a la propia dirección. Reemplaza al
 * `openReceiveModal` de Pollar, que tiene otro look. Para el usuario social/
 * custodial es su vía de fondeo: comparte su dirección (QR o texto), le entra USDC
 * y de ahí se pone a invertir.
 */
export function ReceiveModal({ open, onOpenChange, address }: ReceiveModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  // While this sheet is open `useIdleFunds` re-reads the balance every 12s —
  // that is what `awaitingFunds` turns on. Nothing is fetched here: an arrival
  // is that number going up from what it was when the sheet opened.
  //
  // Nothing is cleared on close either. `DepositPanel` mounts this through
  // `useModalPresence`, so the component unmounts once the exit animation ends
  // and the next open starts from nothing.
  const walletUsdc = useWalletUsdc();
  const baseline = useRef<number | null>(null);
  const [received, setReceived] = useState<number | null>(null);

  // The callback arrives inline from `DepositPanel`, so it is a new function on
  // every render of the parent — and the game clock re-renders it once a second.
  // Held in a ref, the timeout below depends only on the arrival and lives long
  // enough to fire.
  const closeRef = useRef(onOpenChange);
  useEffect(() => {
    closeRef.current = onOpenChange;
  });

  useEffect(() => {
    // `null` is "not known yet", not "zero": taking it as the opening balance
    // would read the first real reading as money arriving.
    if (!open || walletUsdc === null || received !== null) return;
    if (baseline.current === null) {
      baseline.current = walletUsdc;
      return;
    }
    const delta = walletUsdc - baseline.current;
    if (delta >= ARRIVAL_FLOOR) setReceived(delta);
  }, [open, walletUsdc, received]);

  // Arrived: say so, then get out of the way — the prompt to put the money to
  // work takes the screen this one frees.
  useEffect(() => {
    if (received === null) return;
    const id = window.setTimeout(() => closeRef.current(), ARRIVED_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [received]);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard bloqueado (permisos): el QR sigue disponible; no rompemos nada.
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('deposit.receive.title', 'Deposit')}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-6"
    >
      {received !== null ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-black border-b-2 bg-primary text-black">
            <FiCheck className="h-8 w-8" />
          </span>
          <p className="text-4xl font-bold tabular-nums text-black">{formatUsdPrecise(received)}</p>
          <p className="text-base font-extrabold text-black">{t('deposit.receive.arrived', 'Your money arrived')}</p>
          <p className="max-w-xs text-sm text-gray-500">
            {t('deposit.receive.arrivedSubtitle', 'It is in your wallet, ready to put to work.')}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 text-center">
            {t(
              'deposit.receive.subtitle',
              'Send USDC on Stellar to this address. It will show up in your balance, ready to invest.',
            )}
          </p>

          {/* Minimum disclaimer. The floor is `MIN_IDLE_USDC` — what lands here is
          received, not typed, and from that balance up the app can already put
          it to work — so the number comes from the same place that gates it and
          not from the translation. */}
          <p className="text-center text-xs font-semibold text-black">
            {t('deposit.receive.minDeposit', 'Minimum deposit: {{amount}} USDC.', {
              amount: formatTokenPrecise(MIN_IDLE_USDC, MIN_IDLE_USDC_DECIMALS),
            })}
          </p>

          {/* QR de la dirección, en caja blanca redondeada (estilo app). */}
          <div className="mx-auto w-fit rounded-xl border border-black border-b-2 bg-white p-4">
            <QRCode value={address || ' '} size={168} bgColor="#ffffff" fgColor="#1a1a1a" className="h-[168px] w-[168px]" />
          </div>

          {/* Dirección TRUNCADA (no ocupa 4 renglones) + copiar inline. */}
          <div className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-2.5">
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-gray-500">{t('deposit.receive.addressLabel', 'Your address')}</span>
              <span className="block text-sm font-mono text-black truncate">
                {address ? truncateMiddle(address, 8, 8) : '—'}
              </span>
            </span>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!address}
              aria-label={t('deposit.receive.copyAria', 'Copy address')}
              className="flex items-center gap-1.5 shrink-0 rounded-md border border-black border-b-2 bg-[#DDF4FF] px-3 py-2 text-black text-xs font-semibold transition active:translate-y-0.5 hover:bg-[#c4ecff] disabled:opacity-50"
            >
              {copied ? <FiCheck className="w-4 h-4" /> : <FiCopy className="w-4 h-4" />}
              {copied ? t('deposit.receive.copied', 'Copied') : t('deposit.receive.copy', 'Copy')}
            </button>
          </div>

          <div className="flex items-start justify-center gap-1.5 text-xs text-gray-400">
            <FiAlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              {t(
                'deposit.receive.warning',
                'Only send Stellar assets to this address. Funds sent from another network are lost.',
              )}
            </p>
          </div>
        </>
      )}
    </AppModal>
  );
}
