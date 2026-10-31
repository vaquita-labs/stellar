'use client';

import { buildPaymentQr, parseStellarPayment, type StellarPaymentRequest } from '@/core-ui/helpers/stellarPayment';
import { MONEY_INPUT_DECIMALS } from '@/core-ui/helpers/numbers';
import { useConfigStore } from '@/core-ui/stores';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiCamera, FiCheck, FiCopy } from 'react-icons/fi';
import QRCode from 'react-qr-code';
import { useModalPresence } from '../../molecules/AppModal';
import { PageLayout } from '../../molecules/PageLayout';
import { PressableButton } from '../../molecules/PressableButton';
import { SegmentedTabs } from '../../molecules/SegmentedTabs';
import { WalletSendModal } from '../profile/WalletSendModal';

type Tab = 'receive' | 'pay';
type ScanState = 'idle' | 'requesting' | 'scanning' | 'denied' | 'noQr' | 'invalid';

const SCAN_REGION_ID = 'qr-pay-scan-region';
/** The camera gives up after this long without a usable code. */
const SCAN_TIMEOUT_MS = 45_000;
const INPUT_CLASSES =
  'w-full h-12 px-4 rounded-md bg-white border border-black border-b-2 text-black text-base ' +
  'placeholder:text-gray-400 outline-none focus:border-b-3 transition';

/** Trims the typed amount to a number with at most `decimals` decimals. */
const sanitizeAmount = (raw: string, decimals: number): string => {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole ?? '';
  return `${whole}.${rest.join('').slice(0, decimals)}`;
};

/**
 * Paying and getting paid by QR, between Vaquita users or with any Stellar
 * wallet. "Get paid" shows the user's code (the bare address, or a payment
 * link once an amount is set, so the payer's app fills the amount in). "Pay"
 * reads a code with the camera and opens the app's own send sheet with the
 * destination, amount and memo it carried. The transfer itself is the one
 * the wallet screen already does.
 */
export function QrPayPage() {
  const { t } = useTranslation();
  const { walletAddress, token } = useConfigStore();
  const address = walletAddress ?? '';
  const [tab, setTab] = useState<Tab>('receive');

  // Get paid.
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const qrValue = buildPaymentQr(address, {
    amount,
    assetCode: token?.symbol,
    assetIssuer: token?.issuer ?? null,
  });
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard can be unavailable in an installed app; the address stays on screen to select.
    }
  };

  // Pay.
  const [scan, setScan] = useState<ScanState>('idle');
  const [payment, setPayment] = useState<StellarPaymentRequest | null>(null);
  const sendMounted = useModalPresence(payment !== null);
  // Loose type: html5-qrcode is lazy-loaded (it touches `document` on import).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      // stop() throws when the camera never started.
    }
    try {
      scanner.clear();
    } catch {
      // Already cleared.
    }
  }, []);

  // The camera is released when the page or the tab goes away.
  useEffect(() => () => void stopScanner(), [stopScanner]);
  useEffect(() => {
    if (tab !== 'pay') void stopScanner();
  }, [tab, stopScanner]);

  const startScanning = async () => {
    handledRef.current = false;
    setScan('requesting');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const scanner = new Html5Qrcode(SCAN_REGION_ID, false);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10 },
        (decoded: string) => {
          if (handledRef.current) return;
          const parsed = parseStellarPayment(decoded);
          if (!parsed) {
            setScan('invalid');
            return;
          }
          handledRef.current = true;
          void stopScanner().then(() => {
            setScan('idle');
            setPayment(parsed);
          });
        },
        () => {
          // Per-frame "no code in sight": intentionally quiet.
        },
      );
      setScan('scanning');
      timeoutRef.current = setTimeout(() => {
        void stopScanner();
        setScan('noQr');
      }, SCAN_TIMEOUT_MS);
    } catch {
      await stopScanner();
      setScan('denied');
    }
  };

  const scanning = scan === 'scanning' || scan === 'invalid';
  const placeholder: Record<ScanState, string> = {
    idle: t('qrPay.scan.idle', 'Point the camera at the code'),
    requesting: t('qrPay.scan.requesting', 'Opening the camera…'),
    scanning: '',
    invalid: t('qrPay.scan.invalid', 'That code is not a payment. Keep pointing.'),
    denied: t('qrPay.scan.denied', 'The camera is blocked. Allow it in your browser settings.'),
    noQr: t('qrPay.scan.noQr', 'No code found. Try again.'),
  };

  return (
    <PageLayout title={t('qrPay.title', 'Pay with QR')} contentGap="gap-4">
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        ariaLabel={t('qrPay.tabsAria', 'Get paid or pay')}
        tabs={[
          { key: 'receive', label: t('qrPay.tab.receive', 'Get paid') },
          { key: 'pay', label: t('qrPay.tab.pay', 'Pay') },
        ]}
      />

      {tab === 'receive' ? (
        <>
          <p className="text-center text-sm text-gray-600">
            {t('qrPay.receive.hint', 'Show this code to whoever pays you. It works from any Stellar wallet.')}
          </p>
          {/* `data-ph-block`: the address drawn in pixels, which the replay's text masking does not reach. */}
          <div data-ph-block className="mx-auto w-fit rounded-xl border border-black border-b-2 bg-white p-4">
            <QRCode value={qrValue || ' '} size={200} bgColor="#ffffff" fgColor="#1a1a1a" className="h-[200px] w-[200px]" />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-gray-600">
              {t('qrPay.receive.amountLabel', 'Amount to charge, optional')}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value, MONEY_INPUT_DECIMALS))}
              placeholder={t('qrPay.receive.amountPlaceholder', '0.00 {{symbol}}', { symbol: token?.symbol ?? 'USDC' })}
              className={INPUT_CLASSES}
            />
          </label>
          <div className="flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3">
            <span className="min-w-0 flex-1 break-all text-xs text-gray-600">{address || '—'}</span>
            <button
              type="button"
              onClick={() => void copyAddress()}
              disabled={!address}
              aria-label={t('qrPay.receive.copy', 'Copy address')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black border-b-2 bg-white text-black transition active:translate-y-0.5"
            >
              {copied ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-center text-sm text-gray-600">
            {t('qrPay.pay.hint', 'Scan the code of whoever you pay. You confirm the amount before anything is sent.')}
          </p>
          <div className="relative mx-auto aspect-square w-full max-w-[16rem] overflow-hidden rounded-2xl border-2 border-black border-b-4 bg-black">
            <div
              id={SCAN_REGION_ID}
              className={`absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover ${scanning ? 'opacity-100' : 'opacity-0'}`}
            />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
                {scan === 'denied' || scan === 'noQr' ? (
                  <FiAlertCircle className="h-10 w-10 opacity-80" />
                ) : (
                  <FiCamera className="h-10 w-10 opacity-80" />
                )}
                <p className="text-xs font-semibold opacity-80">{placeholder[scan]}</p>
              </div>
            )}
            {scan === 'invalid' && (
              <p className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-center text-xs text-white">
                {placeholder.invalid}
              </p>
            )}
          </div>
          {scanning ? (
            <PressableButton variant="white" size="md" fullWidth onClick={() => void stopScanner().then(() => setScan('idle'))}>
              {t('qrPay.pay.stop', 'Stop')}
            </PressableButton>
          ) : (
            <PressableButton
              variant="primary"
              size="md"
              fullWidth
              onClick={() => void startScanning()}
              disabled={scan === 'requesting' || !address}
            >
              {t('qrPay.pay.scan', 'Scan a code')}
            </PressableButton>
          )}
        </>
      )}

      {sendMounted && (
        <WalletSendModal
          open={payment !== null}
          onOpenChange={() => setPayment(null)}
          address={address}
          token={token}
          initialDestination={payment?.destination}
          initialAmount={payment?.amount}
          initialMemo={payment?.memo ?? null}
        />
      )}
    </PageLayout>
  );
}
