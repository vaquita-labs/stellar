'use client';

import { Modal, toast } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCamera, FiCheckCircle, FiX } from 'react-icons/fi';
import { useIsMobile, useRedeemAchievementCode } from '../../../hooks';

interface RedeemCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = 'input' | 'scanning' | 'claiming' | 'reward';

const QR_READER_ID = 'redeem-qr-reader';

/**
 * Modal for redeeming hidden / code-gated achievements.
 *
 * Two ways to enter the code:
 *   1. Type/paste it into the text input.
 *   2. Tap "Escanear QR" — opens an in-modal camera scanner (html5-qrcode).
 *      When the scanner decodes any payload, the text autofills the input
 *      and the scanner stops. The user still has to tap "Reclamar" to commit
 *      so they can correct mis-reads before submitting.
 *
 * On success the same coin-reveal animation as `AchievementModal` shows up in
 * the `reward` phase so the UX matches the regular claim flow.
 */
export function RedeemCodeModal({ open, onOpenChange }: RedeemCodeModalProps) {
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<Phase>('input');
  const [code, setCode] = useState('');
  const [reward, setReward] = useState<{ coinReward: number; achievementKey: string } | null>(null);
  const redeem = useRedeemAchievementCode();

  // Keep a ref to the live Html5QrcodeScanner so we can clear() it from any
  // exit path (manual cancel, successful scan, modal close, unmount). The
  // type is loose because we lazy-import the lib only when the user opens
  // the scanner, to keep it out of the initial bundle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);

  /** Stop and tear down the QR scanner if it's running. Idempotent. */
  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      await scanner.clear();
    } catch (err) {
      // clear() can throw if the scanner was never started; safe to ignore.
      console.warn('[redeem] scanner.clear() ignore:', err);
    }
  }, []);

  // Reset internal state every time the modal opens so the previous redeem
  // (success/error/scan-in-progress) doesn't leak into the next session.
  useEffect(() => {
    if (open) {
      setPhase('input');
      setCode('');
      setReward(null);
    } else {
      void stopScanner();
    }
  }, [open, stopScanner]);

  // Final cleanup: if the component unmounts mid-scan, tear down the camera.
  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  const handleStartScan = useCallback(async () => {
    setPhase('scanning');
    try {
      // Lazy-load html5-qrcode so the ~150kb scanner UI doesn't ship in the
      // main bundle. It accesses `document` at module level and would fail
      // under SSR otherwise.
      const { Html5QrcodeScanner } = await import('html5-qrcode');
      // Wait one tick so the QR_READER_ID div has mounted via the render below.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const scanner = new Html5QrcodeScanner(
        QR_READER_ID,
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          rememberLastUsedCamera: true,
          showTorchButtonIfSupported: true,
        },
        /* verbose */ false,
      );
      scannerRef.current = scanner;
      scanner.render(
        (decodedText) => {
          // Autofill input + return to the input phase so the user can review
          // the value before tapping "Reclamar". Some QR payloads are URLs;
          // strip a `code=` query param if present, otherwise use raw text.
          const cleaned = extractCodeFromPayload(decodedText);
          setCode(cleaned);
          void stopScanner();
          setPhase('input');
        },
        () => {
          // Per-frame "no QR detected" callback — extremely noisy, intentional no-op.
        },
      );
    } catch (err) {
      console.warn('[redeem] failed to start scanner:', err);
      toast.danger('Could not start camera', {
        description: (err as Error)?.message ?? 'Camera access was denied or unavailable.',
      });
      setPhase('input');
    }
  }, [stopScanner]);

  const handleCancelScan = useCallback(async () => {
    await stopScanner();
    setPhase('input');
  }, [stopScanner]);

  const handleRedeem = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.danger('Enter a code', { description: 'Type or scan a code first.' });
      return;
    }
    setPhase('claiming');
    try {
      const result = await redeem.mutateAsync(trimmed);
      setReward({ coinReward: result?.coinReward ?? 0, achievementKey: result?.achievementKey ?? '' });
      setPhase('reward');
    } catch (err) {
      const message = (err as Error)?.message ?? 'Unknown error';
      toast.danger('Could not redeem code', { description: message });
      setPhase('input');
    }
  }, [code, redeem]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  /* ------------------------------------------------------------------ */
  /* Phase renderers                                                    */
  /* ------------------------------------------------------------------ */

  const renderInput = () => (
    <motion.div
      key="input"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col"
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
        <div className="text-center max-w-md flex flex-col items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-extrabold text-black">Canjear código</h2>
          <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
            Ingresa el código de tu evento o evento secreto para reclamar un premio especial.
          </p>
        </div>

        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="EJ: VAQUITA-LAUNCH-2026"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="w-full max-w-md h-12 px-4 rounded-md bg-white border border-black border-b-2 text-black text-base font-semibold tracking-wide placeholder:text-gray-400 placeholder:font-normal placeholder:tracking-normal outline-none focus:border-b-3 transition uppercase"
        />

        <button
          type="button"
          onClick={() => void handleStartScan()}
          className="w-full max-w-md h-11 inline-flex items-center justify-center gap-2 rounded-md bg-white hover:bg-gray-50 text-black border border-black border-b-2 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
        >
          <FiCamera className="h-4 w-4" />
          Escanear QR
        </button>
      </div>

      <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
        <button
          type="button"
          onClick={() => void handleRedeem()}
          disabled={!code.trim()}
          className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          Reclamar
        </button>
      </div>
    </motion.div>
  );

  const renderScanning = () => (
    <motion.div
      key="scanning"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col"
    >
      <div className="flex-1 flex flex-col items-center justify-start px-6 pt-2 gap-3 overflow-y-auto">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mt-1">
          Apunta la cámara al QR
        </p>
        <div
          id={QR_READER_ID}
          className="w-full max-w-md rounded-2xl overflow-hidden border border-black/10 bg-black/5 [&_button]:!rounded-md [&_button]:!bg-white [&_button]:!border [&_button]:!border-black [&_button]:!text-black [&_button]:!font-bold [&_button]:!uppercase [&_button]:!text-xs [&_select]:!rounded-md [&_select]:!border [&_select]:!border-black"
        />
      </div>
      <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
        <button
          type="button"
          onClick={() => void handleCancelScan()}
          className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-white hover:bg-gray-50 text-black border border-black border-b-2 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
        >
          Cancelar
        </button>
      </div>
    </motion.div>
  );

  const renderClaiming = () => (
    <motion.div
      key="claiming"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
    >
      <div className="flex items-center gap-2" role="status" aria-label="Redeeming code">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-3 w-3 rounded-full bg-primary border border-black"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
          />
        ))}
      </div>
      <p className="text-sm font-bold uppercase tracking-wider text-gray-500">Validando código</p>
    </motion.div>
  );

  const renderReward = () => (
    <motion.div
      key="reward"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col"
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
        <motion.div
          initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          className="relative flex items-center justify-center"
        >
          <span
            aria-hidden
            className="absolute inset-0 rounded-full blur-2xl opacity-60"
            style={{ background: 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)' }}
          />
          <Image
            src="/icons/global/coin.png"
            alt=""
            width={160}
            height={160}
            className="relative drop-shadow-xl"
          />
        </motion.div>
        <motion.h2
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-2xl sm:text-3xl font-extrabold text-black text-center inline-flex items-center gap-2"
        >
          <FiCheckCircle className="h-6 w-6 text-[#58CC02]" aria-hidden />
          ¡{reward?.coinReward ?? 0} coins!
        </motion.h2>
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.18 }}
          className="text-sm text-gray-600 text-center max-w-xs"
        >
          Tu logro secreto ya está en tu sala de trofeos.
        </motion.p>
      </div>
      <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
        <button
          type="button"
          onClick={handleClose}
          className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
        >
          Continuar
        </button>
      </div>
    </motion.div>
  );

  /* ------------------------------------------------------------------ */
  /* Shell                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <Modal.Backdrop
      isOpen={open}
      isDismissable={phase !== 'scanning' && phase !== 'claiming'}
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
      className="bg-black/70 backdrop-blur-sm data-[exiting=true]:duration-300"
    >
      <Modal.Container
        size={isMobile ? 'full' : 'md'}
        placement={isMobile ? 'bottom' : 'center'}
        scroll="inside"
        className={isMobile ? 'p-0! m-0!' : 'p-4!'}
      >
        <Modal.Dialog
          className={
            isMobile
              ? 'bg-background m-0! p-0! rounded-t-3xl border-0 max-h-dvh data-[exiting=true]:duration-300'
              : 'bg-background p-0! rounded-3xl border border-black border-b-2 w-full max-w-md h-[min(620px,90dvh)] data-[exiting=true]:duration-300'
          }
        >
          <motion.div
            initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className={`flex flex-col w-full ${isMobile ? 'h-full min-h-dvh' : 'h-full'}`}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={phase === 'claiming'}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition disabled:opacity-50"
              >
                <FiX className="h-5 w-5" />
              </button>
              <span
                className={`h-1.5 w-12 rounded-full bg-black/15 ${isMobile ? '' : 'invisible'}`}
                aria-hidden
              />
              <span className="w-10" />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {phase === 'input' && renderInput()}
              {phase === 'scanning' && renderScanning()}
              {phase === 'claiming' && renderClaiming()}
              {phase === 'reward' && renderReward()}
            </AnimatePresence>
          </motion.div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/**
 * Best-effort extraction of a redemption code from a scanned QR payload.
 *
 *  - Bare codes (`VAQUITA-LAUNCH-2026`) come through verbatim.
 *  - URLs with a `?code=...` or `?c=...` query param hand back the param
 *    (useful so event posters can encode a click-through link AND a code).
 *  - Anything else is returned as-is and the user can edit it before
 *    submitting (e.g. mis-decoded characters from bad lighting).
 */
function extractCodeFromPayload(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const fromQs = url.searchParams.get('code') ?? url.searchParams.get('c');
    if (fromQs) return fromQs.trim();
  } catch {
    // Not a URL — fall through.
  }
  return trimmed;
}
