'use client';

import { parseStellarPayment, type StellarPaymentRequest } from '@/core-ui/helpers/stellarPayment';
import { useConfigStore } from '@/core-ui/stores';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCamera, FiClipboard, FiX } from 'react-icons/fi';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { ModalMessage } from '../../molecules/ModalMessage';
import { PressableButton } from '../../molecules/PressableButton';
import { WalletSendModal } from '../profile/WalletSendModal';

type ScanState = 'idle' | 'requesting' | 'scanning' | 'denied' | 'noQr' | 'invalid';

const SCAN_REGION_ID = 'qr-pay-scan-region';
/** The camera gives up after this long without a usable code. */
const SCAN_TIMEOUT_MS = 90_000;
/** How long the "not a payment" hint stays up while scanning goes on. */
const INVALID_HINT_MS = 2_500;

/**
 * Paying by scanning, like a payments app: the camera opens as soon as the
 * screen does, the code is read inside the frame, and the app's own send sheet
 * opens with the destination, amount and memo it carried. The transfer itself
 * is the one the wallet screen already does. A code from the clipboard works
 * too. When the browser refuses the camera, a sheet says how to allow it.
 *
 * What can be paid today is a Stellar address or payment link. A Bolivian
 * bank QR is shown as coming: reading it is easy, paying it needs the
 * off-ramp, which is not wired to this screen yet.
 */
export function QrPayPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { walletAddress, token } = useConfigStore();
  const address = walletAddress ?? '';

  const [scan, setScan] = useState<ScanState>('requesting');
  const [permissionOpen, setPermissionOpen] = useState(false);
  const permissionMounted = useModalPresence(permissionOpen);
  const [payment, setPayment] = useState<StellarPaymentRequest | null>(null);
  const sendMounted = useModalPresence(payment !== null);
  // Loose type: html5-qrcode is lazy-loaded (it touches `document` on import).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const accept = useCallback(
    (decoded: string) => {
      if (handledRef.current) return;
      const parsed = parseStellarPayment(decoded);
      if (!parsed) {
        setScan('invalid');
        if (hintRef.current) clearTimeout(hintRef.current);
        hintRef.current = setTimeout(() => setScan((s) => (s === 'invalid' ? 'scanning' : s)), INVALID_HINT_MS);
        return;
      }
      handledRef.current = true;
      void stopScanner().then(() => {
        setScan('idle');
        setPayment(parsed);
      });
    },
    [stopScanner],
  );

  const startScanning = useCallback(async () => {
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
        (decoded: string) => accept(decoded),
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
      setPermissionOpen(true);
    }
  }, [accept, stopScanner]);

  // The camera opens with the screen (a tick later, once the region has
  // painted) and is released when the screen goes away.
  useEffect(() => {
    const opening = setTimeout(() => void startScanning(), 0);
    return () => {
      clearTimeout(opening);
      if (hintRef.current) clearTimeout(hintRef.current);
      void stopScanner();
    };
  }, [startScanning, stopScanner]);

  // After the send sheet closes, the camera is back for the next one.
  const closeSend = () => {
    setPayment(null);
    void startScanning();
  };

  const pasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseStellarPayment(text);
      if (!parsed) {
        setScan('invalid');
        if (hintRef.current) clearTimeout(hintRef.current);
        hintRef.current = setTimeout(() => setScan((s) => (s === 'invalid' ? 'scanning' : s)), INVALID_HINT_MS);
        return;
      }
      await stopScanner();
      setScan('idle');
      setPayment(parsed);
    } catch {
      // The clipboard can be unavailable in an installed app; scanning goes on.
    }
  };

  const live = scan === 'scanning' || scan === 'invalid';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* html5-qrcode mounts its <video> feed inside this region; it fills the screen. */}
      <div
        id={SCAN_REGION_ID}
        className={`absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover ${live ? 'opacity-100' : 'opacity-0'}`}
      />
      {/* The shade around the frame, drawn over the feed. */}
      <div className="pointer-events-none absolute inset-0 bg-black/45" />

      <div className="relative flex items-center justify-between px-4 pt-4">
        <button
          type="button"
          onClick={() => router.push('/home')}
          aria-label={t('common.close', 'Close')}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 transition active:translate-y-0.5"
        >
          <FiX className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">{t('qrPay.title', 'Scan to pay')}</h1>
        <span className="h-11 w-11" aria-hidden />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6">
        {/* The frame: four corners around a clear square; the feed shows through, the shade stays outside. */}
        <div className="relative aspect-square w-full max-w-[17rem]">
          <div className="absolute inset-0 rounded-2xl shadow-[0_0_0_200vmax_rgba(0,0,0,0)]" />
          {(
            [
              'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
              'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
              'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
              'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
            ] as const
          ).map((corner) => (
            <span key={corner} className={`absolute h-10 w-10 border-primary ${corner}`} />
          ))}
          {!live && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <FiCamera className="h-10 w-10 opacity-80" />
              <p className="text-sm font-semibold opacity-80">
                {scan === 'requesting' && t('qrPay.scan.requesting', 'Opening the camera…')}
                {scan === 'idle' && t('qrPay.scan.idle', 'Point the camera at the code')}
                {scan === 'denied' && t('qrPay.scan.denied', 'The camera is blocked.')}
                {scan === 'noQr' && t('qrPay.scan.noQr', 'No code found.')}
              </p>
              {(scan === 'denied' || scan === 'noQr') && (
                <PressableButton variant="primary" size="md" onClick={() => void startScanning()}>
                  {t('qrPay.scan.retry', 'Try again')}
                </PressableButton>
              )}
            </div>
          )}
          {scan === 'invalid' && (
            <p className="absolute inset-x-0 -bottom-10 text-center text-xs font-semibold text-white">
              {t('qrPay.scan.invalid', 'That code is not a Stellar payment yet. Keep pointing.')}
            </p>
          )}
        </div>

        {/* What can be scanned. */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-bold">
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
              <Image src="/chains/stellar.png" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
            </span>
            {t('qrPay.methods.stellar', 'Stellar')}
          </span>
          <span className="flex items-center gap-2 opacity-60">
            <span className="text-xl leading-none">🇧🇴</span>
            {t('qrPay.methods.bolivia', 'Bolivia QR')}
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              {t('qrPay.methods.soon', 'Soon')}
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => void pasteCode()}
          className="flex items-center gap-2 text-sm font-semibold underline underline-offset-4 opacity-90 transition active:translate-y-0.5"
        >
          <FiClipboard className="h-4 w-4" />
          {t('qrPay.paste', 'Paste a code')}
        </button>
      </div>

      {permissionMounted && (
        <AppModal
          open={permissionOpen}
          onOpenChange={() => setPermissionOpen(false)}
          title={t('qrPay.permission.title', 'Camera access needed')}
          size="md"
          footer={
            <div className="flex w-full flex-col gap-2">
              <PressableButton
                variant="primary"
                size="md"
                fullWidth
                onClick={() => {
                  setPermissionOpen(false);
                  void startScanning();
                }}
              >
                {t('qrPay.permission.retry', 'Try again')}
              </PressableButton>
              <PressableButton variant="white" size="md" fullWidth onClick={() => setPermissionOpen(false)}>
                {t('qrPay.permission.dismiss', 'Not now')}
              </PressableButton>
            </div>
          }
        >
          <ModalMessage
            icon={FiCamera}
            title={t('qrPay.permission.heading', 'Vaquita needs the camera to scan a code')}
            body={t('qrPay.permission.body', 'Allow the camera for Vaquita in your browser or phone settings, then come back.')}
            className="py-3"
          >
            <ol className="w-full list-decimal space-y-1 pl-5 text-left text-sm text-gray-600">
              <li>{t('qrPay.permission.step1', 'Open your settings and find Vaquita or your browser.')}</li>
              <li>{t('qrPay.permission.step2', 'Turn on Camera.')}</li>
            </ol>
          </ModalMessage>
        </AppModal>
      )}

      {sendMounted && (
        <WalletSendModal
          open={payment !== null}
          onOpenChange={closeSend}
          address={address}
          token={token}
          initialDestination={payment?.destination}
          initialAmount={payment?.amount}
          initialMemo={payment?.memo ?? null}
        />
      )}
    </div>
  );
}
