'use client';

import { Modal, toast } from '@heroui/react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FiCamera, FiCopy, FiImage, FiShare2, FiUserPlus, FiX } from 'react-icons/fi';

interface ShareProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  handle: string;
  /** The URL the QR code should encode. Defaults to the current window URL. */
  profileUrl?: string;
  /** Avatar image src. Defaults to the vaquita isotipo. */
  avatarSrc?: string;
}

const DEFAULT_AVATAR = '/vaquita/vaquita_isotipo.svg';

type TabKey = 'mine' | 'scan';

/**
 * Generates a QR for `data` via a public API. We use an `<img>` (not next/image)
 * to avoid wiring a remote-image domain to next.config — this is a small,
 * scan-on-screen asset.
 *
 * `ecc=L` keeps the module count as low as the spec allows, which gives the
 * cleaner / chunkier QR the design calls for. `qzone=1` trims the surrounding
 * quiet zone since the container already provides white padding.
 */
const buildQrSrc = (data: string, size = 480) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&qzone=1&ecc=L&color=262626&bgcolor=FFFFFF&data=${encodeURIComponent(
    data
  )}`;

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function TabSwitch({
  value,
  onChange,
}: {
  value: TabKey;
  onChange: (key: TabKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="QR view"
      className="inline-flex w-full items-center gap-1 rounded-full border border-black/15 bg-white/70 p-1"
    >
      {([
        { key: 'mine', label: 'My QR' },
        { key: 'scan', label: 'Scan QR' },
      ] as { key: TabKey; label: string }[]).map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`flex-1 h-9 rounded-full text-xs font-extrabold uppercase tracking-wider transition ${
              active
                ? 'bg-primary text-black border border-black border-b-2 shadow-sm'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* My QR view (existing layout, lifted into its own component)         */
/* ------------------------------------------------------------------ */

interface MyQrViewProps {
  url: string;
  displayName: string;
  handle: string;
  avatarSrc: string;
}

/** Centered visual block — avatar + identity + QR + caption. The Share /
 *  Copy action buttons live in the modal's sticky bottom bar, mirroring how
 *  AchievementModal anchors its "Claim award" CTA. */
function MyQrView({ url, displayName, handle, avatarSrc }: MyQrViewProps) {
  const qrSrc = useMemo(() => buildQrSrc(url), [url]);

  // When the user has no full name, `displayName` ends up being the same
  // string as the handle (just without the `@`) — showing both reads as a
  // duplicate. Hide the handle line in that case so the identity block
  // stays tight.
  const isHandleDuplicate =
    handle.replace(/^@/, '').trim().toLowerCase() ===
    displayName.replace(/\s+/g, '').trim().toLowerCase();

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Avatar + identity */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="h-16 w-16 rounded-full bg-white border-2 border-black border-b-4 flex items-center justify-center overflow-hidden shadow">
          <Image src={avatarSrc} alt={displayName} width={56} height={56} className="object-contain" />
        </div>
        <h2 className="text-xl font-extrabold text-black tracking-tight text-center">
          {displayName}
        </h2>
        {!isHandleDuplicate && (
          <p className="text-xs font-semibold text-gray-500 tabular-nums">{handle}</p>
        )}
      </div>

      {/* QR — explicit size classes so the image doesn't stretch with the
          full-screen flex parent. `w-fit` on the frame keeps the white
          padding tight against the QR. */}
      <div className="rounded-2xl bg-white border-2 border-black border-b-4 p-3 w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSrc}
          alt={`QR code for ${handle}`}
          className="block rounded-md h-44 w-44 sm:h-52 sm:w-52"
        />
      </div>

      <p className="text-center text-xs text-gray-600 max-w-[16rem] leading-relaxed">
        Have a friend scan this QR to follow you on Vaquita.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scan QR view (mock — WhatsApp-style)                                */
/* ------------------------------------------------------------------ */

type ScanState = 'idle' | 'requesting' | 'scanning' | 'success' | 'denied';

/**
 * Mocked camera flow: we ask for `getUserMedia` so the permission UX feels
 * real, but we deliberately do not wire a QR decoder yet — that lives in
 * another bloque. After 2.5s of "scanning" we resolve with a demo handle
 * so the rest of the flow is testable.
 */
function ScanQrView({ onScanned }: { onScanned: (handle: string) => void }) {
  const [state, setState] = useState<ScanState>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopStream = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  // Always release the camera when the view unmounts.
  useEffect(() => () => stopStream(), []);

  const startCamera = async () => {
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState('scanning');
      // Mocked detection — resolves after a short delay.
      timerRef.current = setTimeout(() => {
        setState('success');
        onScanned('@demo_vaquero');
        stopStream();
      }, 2500);
    } catch {
      setState('denied');
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative w-full aspect-square overflow-hidden rounded-2xl bg-black border-2 border-black border-b-4">
        {/* Live camera feed (only meaningful while scanning). */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${
            state === 'scanning' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Idle / requesting / denied placeholder. */}
        {state !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <FiCamera className="h-10 w-10 opacity-80" />
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">
              {state === 'idle' && 'Camera off'}
              {state === 'requesting' && 'Requesting access…'}
              {state === 'success' && 'QR detected'}
              {state === 'denied' && 'Camera blocked'}
            </p>
          </div>
        )}

        {/* Targeting frame — corners only, like WhatsApp / iOS Camera. */}
        <div className="pointer-events-none absolute inset-6">
          {(['top-0 left-0 border-t-2 border-l-2 rounded-tl-xl',
             'top-0 right-0 border-t-2 border-r-2 rounded-tr-xl',
             'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl',
             'bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl']).map((corner) => (
            <span
              key={corner}
              className={`absolute h-8 w-8 border-primary ${corner}`}
              aria-hidden
            />
          ))}
        </div>

        {/* Scanning sweep line. */}
        {state === 'scanning' && (
          <div className="pointer-events-none absolute inset-x-6 top-6 bottom-6 overflow-hidden">
            <motion.span
              className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_12px_2px_rgba(245,161,97,0.8)]"
              initial={{ top: 0 }}
              animate={{ top: '100%' }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', repeatType: 'reverse' }}
            />
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-600 max-w-[16rem] leading-relaxed">
        Point the camera at a vaquero&apos;s QR to follow them instantly.
      </p>

      {/* Primary action — varies with state */}
      {state === 'idle' && (
        <button
          type="button"
          onClick={startCamera}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-xs font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5"
        >
          <FiCamera className="h-4 w-4" />
          Start scanning
        </button>
      )}
      {state === 'denied' && (
        <button
          type="button"
          onClick={startCamera}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-white text-black border border-black border-b-3 text-xs font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5"
        >
          Try again
        </button>
      )}
      {state === 'success' && (
        <div className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#DCFFE0] border border-[#9ED36A] py-2.5 text-xs font-extrabold uppercase tracking-wider text-black">
          <FiUserPlus className="h-4 w-4" />
          Following @demo_vaquero
        </div>
      )}

      {/* Secondary — upload image w/ a QR (mocked, kept disabled for now) */}
      <button
        type="button"
        disabled
        className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-md bg-white text-gray-400 border border-black/20 text-[11px] font-extrabold uppercase tracking-wider opacity-70 cursor-not-allowed"
      >
        <FiImage className="h-3.5 w-3.5" />
        Upload from gallery · soon
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main modal                                                          */
/* ------------------------------------------------------------------ */

export function ShareProfileModal({
  open,
  onOpenChange,
  displayName,
  handle,
  profileUrl,
  avatarSrc = DEFAULT_AVATAR,
}: ShareProfileModalProps) {
  const [tab, setTab] = useState<TabKey>('mine');

  // Reset to the default tab every time the modal opens.
  useEffect(() => {
    if (open) setTab('mine');
  }, [open]);

  const url = useMemo(() => {
    if (profileUrl) return profileUrl;
    if (typeof window !== 'undefined') return window.location.href;
    return 'https://vaquita.finance';
  }, [profileUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Profile link copied');
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      toast.danger('Could not copy link', { description: message });
    }
  };

  const handleNativeShare = async () => {
    try {
      if (typeof navigator !== 'undefined' && (navigator as Navigator & { share?: unknown }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: `${displayName} on Vaquita`,
          text: `Follow ${displayName} on Vaquita 🐮`,
          url,
        });
        return;
      }
      await handleCopy();
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      if (message && !message.toLowerCase().includes('abort')) {
        toast.danger('Could not share', { description: message });
      }
    }
  };

  const handleScanned = (scannedHandle: string) => {
    toast.success(`Now following ${scannedHandle}`);
  };

  /* ---------------------------------------------------------------- */
  /* Bottom-sheet layout — same pattern as `AchievementModal`. The dialog
   * fills the screen from the bottom edge, with rounded top corners, an
   * X-on-left + drag-handle-center header, centered content, and an
   * anchored CTA bar at the bottom. `aria-label` on the Dialog silences
   * the React Aria "Dialog must have a title" warning that otherwise
   * triggered an extra commit-time re-render (visible as a close flicker).
   */
  return (
    <Modal.Backdrop
      isOpen={open}
      isDismissable
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
      className="bg-black/70 backdrop-blur-sm data-[exiting=true]:duration-300"
    >
      <Modal.Container size="full" placement="bottom" scroll="inside" className="p-0! m-0!">
        <Modal.Dialog
          aria-label={tab === 'mine' ? 'Share your profile QR' : 'Scan a profile QR'}
          className="bg-background m-0! p-0! rounded-t-3xl sm:rounded-t-[2rem] border-0 max-h-dvh data-[exiting=true]:duration-300"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className="flex flex-col h-full min-h-dvh w-full"
          >
            {/* Header — X on the left, drag handle in the middle, spacer on
                the right to keep the handle visually centered. Mirrors the
                AchievementModal top bar. */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
              <span className="h-1.5 w-12 rounded-full bg-black/15" aria-hidden />
              <span className="w-10" aria-hidden />
            </div>

            {/* Tab switch — bounded width so it doesn't stretch on tablets. */}
            <div className="px-5 sm:px-10 pb-2">
              <div className="max-w-md mx-auto">
                <TabSwitch value={tab} onChange={setTab} />
              </div>
            </div>

            {/* Centered content area — matches AchievementModal exactly. No
                custom overflow / fixed height: when the content exceeds the
                viewport, `Modal.Container scroll="inside"` makes the whole
                modal scroll. Stacking a hand-rolled overflow scroller here
                was forcing a layout recompute during the close animation,
                which read on screen as a flicker. */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4">
              <div className="w-full max-w-md">
                {tab === 'mine' ? (
                  <MyQrView
                    url={url}
                    displayName={displayName}
                    handle={handle}
                    avatarSrc={avatarSrc}
                  />
                ) : (
                  <ScanQrView onScanned={handleScanned} />
                )}
              </div>
            </div>

            {/* Anchored bottom CTA bar — only on the "My QR" tab. The scan
                view manages its own state-dependent buttons inline. */}
            {tab === 'mine' && (
              <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
                <div className="max-w-md mx-auto flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
                  >
                    <FiShare2 className="h-4 w-4" />
                    Share link
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-white hover:bg-white/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
                  >
                    <FiCopy className="h-4 w-4" />
                    Copy link
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
