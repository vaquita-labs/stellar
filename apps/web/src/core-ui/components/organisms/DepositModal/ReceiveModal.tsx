'use client';

import { formatTokenPrecise, formatUsdPrecise, MIN_IDLE_USDC, MIN_IDLE_USDC_DECIMALS } from '@/core-ui/helpers/numbers';
import { truncateMiddle } from '@/core-ui/helpers/strings';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiCheck, FiCopy, FiExternalLink } from 'react-icons/fi';
import QRCode from 'react-qr-code';
import { useCloseDepositIntent, useOpenDepositIntentMutation } from '../../../hooks/useDepositIntents';
import { useWalletUsdc } from '../../../hooks/useWalletUsdc';
import type { DepositPlatformDTO } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

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
  /**
   * La app desde la que el usuario dice que va a mandar ("Depositar desde otra
   * app"). Suma el checklist de esa app y el botón para abrirla, y deja abierta
   * la espera que respalda la tarjeta del home hasta que la plata llegue.
   */
  platform?: DepositPlatformDTO | null;
  /** Back al tutorial de la plataforma. */
  onBack?: () => void;
}

/**
 * Modal nativo (estilo app) para RECIBIR USDC a la propia dirección. Reemplaza al
 * `openReceiveModal` de Pollar, que tiene otro look. Para el usuario social/
 * custodial es su vía de fondeo: comparte su dirección (QR o texto), le entra USDC
 * y de ahí se pone a invertir.
 */
export function ReceiveModal({ open, onOpenChange, address, platform, onBack }: ReceiveModalProps) {
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

  // Mostrar la dirección de una plataforma ES lo que abre la espera: a partir de
  // acá el usuario se va a su app a retirar, y la tarjeta del home tiene que
  // estar cuando vuelva. Una por montaje: el sheet se desmonta al cerrar.
  const openIntent = useOpenDepositIntentMutation();
  const closeIntent = useCloseDepositIntent();
  const platformId = platform?.id ?? null;
  const intentOpened = useRef(false);
  useEffect(() => {
    if (!open || !platformId || intentOpened.current) return;
    intentOpened.current = true;
    openIntent.mutate(platformId);
  }, [open, platformId, openIntent]);
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

  // Llegó: la espera se cierra acá mismo, sin esperar a que la tarjeta del home
  // lo note por su cuenta.
  const intentId = openIntent.data?.id ?? null;
  const closeIntentRef = useRef(closeIntent.mutate);
  useEffect(() => {
    closeIntentRef.current = closeIntent.mutate;
  });
  useEffect(() => {
    if (received !== null && intentId) closeIntentRef.current({ id: intentId, action: 'arrived' });
  }, [received, intentId]);

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

  // Abrir la app de origen: el usuario copió la dirección y lo siguiente es ir
  // a retirar. Sin `appUrl` en el catálogo no hay botón.
  const footer =
    platform?.appUrl && received === null ? (
      <PressableButton
        variant="success"
        size="cta"
        className="py-2.5!"
        onClick={() => window.open(platform.appUrl!, '_blank', 'noopener,noreferrer')}
      >
        {t('deposit.otherApp.receive.openApp', 'Open {{name}}', { name: platform.name })}
        <FiExternalLink className="h-4 w-4" />
      </PressableButton>
    ) : undefined;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        platform
          ? t('deposit.otherApp.receive.title', 'Send from {{name}}', { name: platform.name })
          : t('deposit.receive.title', 'Deposit')
      }
      size="md"
      onBack={received === null ? onBack : undefined}
      bodyClassName={'flex flex-col gap-4 ' + (footer ? 'pb-2' : 'pb-6')}
      footer={footer}
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

          {platform ? (
            // Lo que el usuario tiene que elegir del lado de su app. Cada línea es
            // un error que cuesta la plata o la demora: otra moneda, otra red, un
            // memo que la app pide aunque la dirección no lo necesita.
            <div className="rounded-lg border border-black border-b-2 bg-white px-4 py-2 text-sm">
              {[
                [t('deposit.otherApp.receive.coin', 'Coin'), platform.asset],
                [
                  t('deposit.otherApp.receive.network', 'Network'),
                  t(`deposit.otherApp.networks.${platform.network}`, platform.network),
                ],
                [t('deposit.otherApp.receive.memo', 'MEMO'), t('deposit.otherApp.receive.memoEmpty', 'Leave it empty')],
                ...(platform.fee ? [[t('deposit.otherApp.receive.fee', 'Fee'), platform.fee]] : []),
                ...(platform.minAmount
                  ? [[t('deposit.otherApp.tutorial.min', 'Minimum'), `${platform.minAmount} ${platform.asset}`]]
                  : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-black/10 py-1.5 last:border-b-0">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-bold text-black">{value}</span>
                </div>
              ))}
            </div>
          ) : null}

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
