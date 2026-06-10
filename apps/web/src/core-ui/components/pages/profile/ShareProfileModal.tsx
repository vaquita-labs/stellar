'use client';

import { getJson } from '@/core-ui/api/http';
import { Modal, toast } from '@heroui/react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiCamera, FiCopy, FiImage, FiLoader, FiShare2, FiUserPlus, FiX } from 'react-icons/fi';
import { useToggleFollow } from '../../../hooks';
import { useConfigStore } from '../../../stores';

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

/** Stellar public keys: `G` + 55 base32 chars. */
const STELLAR_WALLET_RE = /^G[A-Z2-7]{55}$/;

/** The unique follow deep link encoded in the user's QR (and share links). */
const buildFollowUrl = (origin: string, wallet: string) =>
  `${origin}/profile?follow=${encodeURIComponent(wallet)}`;

/**
 * Best-effort extraction of a wallet address from a scanned QR payload.
 * Accepts our follow deep links (`…?follow=G…`) and bare Stellar public
 * keys; anything else is not a Vaquita profile QR.
 */
function extractWalletFromPayload(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const fromUrl = new URL(trimmed).searchParams.get('follow')?.trim();
    if (fromUrl && STELLAR_WALLET_RE.test(fromUrl.toUpperCase())) return fromUrl;
  } catch {
    // Not a URL — fall through to the bare-wallet check.
  }
  return STELLAR_WALLET_RE.test(trimmed.toUpperCase()) ? trimmed : null;
}

/** `@nickname` (spaces stripped) or a wallet-derived fallback, mirroring ProfilePage. */
const toScannedHandle = (nickname: string | null | undefined, wallet: string) => {
  const nick = nickname?.trim();
  return nick ? `@${nick.replace(/\s+/g, '')}` : `@vaquero${wallet.slice(-4)}`;
};

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
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('social.share.tabsLabel')}
      className="inline-flex w-full items-center gap-1 rounded-full border border-black/15 bg-white/70 p-1"
    >
      {([
        { key: 'mine', label: t('social.share.tabMine') },
        { key: 'scan', label: t('social.share.tabScan') },
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
  const { t } = useTranslation();
  // The QR is a remote image (api.qrserver.com), so it can take a beat (or
  // fail offline) — show a spinner in the frame until it actually paints.
  const [qrStatus, setQrStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Bumped on retry to cache-bust the failed request.
  const [qrAttempt, setQrAttempt] = useState(0);
  const qrImgRef = useRef<HTMLImageElement | null>(null);
  const qrSrc = useMemo(() => {
    const base = buildQrSrc(url);
    return qrAttempt ? `${base}&attempt=${qrAttempt}` : base;
  }, [url, qrAttempt]);

  // Reset to the spinner whenever the src changes, but recognize images the
  // browser already has (cached `complete` images may never fire onLoad).
  useEffect(() => {
    const img = qrImgRef.current;
    setQrStatus(img?.complete && img.naturalWidth > 0 ? 'ready' : 'loading');
  }, [qrSrc]);

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
      <div className="relative rounded-2xl bg-white border-2 border-black border-b-4 p-3 w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={qrImgRef}
          src={qrSrc}
          alt={t('social.share.qrAlt', { handle })}
          onLoad={() => setQrStatus('ready')}
          onError={() => setQrStatus('error')}
          className={`block rounded-md h-44 w-44 sm:h-52 sm:w-52 transition-opacity ${
            qrStatus === 'ready' ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {qrStatus !== 'ready' && (
          <div className="absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-md bg-white text-center">
            {qrStatus === 'loading' ? (
              <FiLoader
                className="h-8 w-8 animate-spin text-gray-400"
                role="status"
                aria-label={t('common.loading')}
              />
            ) : (
              <>
                <FiAlertCircle className="h-7 w-7 text-gray-400" />
                <p className="px-4 text-[11px] font-semibold text-gray-500 leading-snug">
                  {t('social.share.qrLoadFailed')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQrStatus('loading');
                    setQrAttempt((n) => n + 1);
                  }}
                  className="rounded-md bg-white border border-black border-b-2 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-black hover:-translate-y-0.5 transition"
                >
                  {t('social.share.tryAgain')}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-600 max-w-[16rem] leading-relaxed">
        {t('social.share.myQrCaption')}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scan QR view (live html5-qrcode decoder — WhatsApp-style)           */
/* ------------------------------------------------------------------ */

type ScanState =
  | 'idle' // camera off
  | 'requesting' // waiting for camera permission
  | 'scanning' // camera live, decoder running
  | 'noQr' // timed out without decoding a usable QR
  | 'denied' // permission refused / camera unavailable
  | 'processing' // valid QR decoded, follow request in flight
  | 'success' // followed the scanned vaquero
  | 'failed'; // decoded a QR we can't act on (own QR / not found / API error)

const SCAN_REGION_ID = 'share-profile-qr-reader';
/** How long the camera keeps looking for a QR before giving up. */
const SCAN_TIMEOUT_MS = 30_000;
/** How long the "not a Vaquita QR" hint stays up while scanning continues. */
const INVALID_HINT_MS = 2_500;

/**
 * Live scan flow: html5-qrcode (lazy-loaded) decodes frames from the rear
 * camera. A decoded payload that maps to a vaquero wallet triggers the real
 * follow mutation; payloads that aren't Vaquita profiles show a transient
 * hint and scanning continues until `SCAN_TIMEOUT_MS` elapses with nothing
 * usable, at which point we surface "no QR detected" with a retry.
 */
function ScanQrView({
  ownWallet,
  onFollowed,
}: {
  ownWallet: string | null;
  onFollowed: (handle: string) => void;
}) {
  const { t } = useTranslation();
  const toggleFollow = useToggleFollow();
  const [state, setState] = useState<ScanState>('idle');
  const [resultHandle, setResultHandle] = useState('');
  const [failMessage, setFailMessage] = useState('');
  const [invalidHint, setInvalidHint] = useState(false);

  // Loose type because html5-qrcode is lazy-imported to stay out of the
  // initial bundle (it touches `document` at module level → breaks SSR).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set on the first usable decode so the per-frame success callback can't
  // double-fire the follow flow.
  const handledRef = useRef(false);

  /** Stop the decoder and release the camera. Idempotent. */
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
      // stop() throws if the camera never started; safe to ignore.
    }
    try {
      scanner.clear();
    } catch {
      // Already cleared.
    }
  }, []);

  // Always release the camera when the view unmounts (tab switch / close).
  useEffect(
    () => () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      void stopScanner();
    },
    [stopScanner]
  );

  const showInvalidHint = useCallback(() => {
    setInvalidHint(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setInvalidHint(false), INVALID_HINT_MS);
  }, []);

  const handleDecoded = useCallback(
    async (payload: string) => {
      if (handledRef.current) return;
      const wallet = extractWalletFromPayload(payload);
      if (!wallet) {
        // Decoded *something*, but it isn't a Vaquita profile — keep scanning.
        showInvalidHint();
        return;
      }
      handledRef.current = true;
      setInvalidHint(false);
      await stopScanner();

      if (ownWallet && wallet.toUpperCase() === ownWallet.toUpperCase()) {
        setFailMessage(t('social.share.ownQr'));
        setState('failed');
        return;
      }

      setState('processing');
      try {
        // 404 → null: the wallet in the QR doesn't belong to a vaquero.
        const profile = await getJson<{ nickname?: string | null }>(
          `/profile/wallet/${wallet}`,
          [404]
        );
        if (!profile) {
          setFailMessage(t('social.share.vaqueroNotFound'));
          setState('failed');
          return;
        }
        await toggleFollow.mutateAsync({ targetWallet: wallet, isFollowing: false });
        const handle = toScannedHandle(profile.nickname, wallet);
        setResultHandle(handle);
        setState('success');
        onFollowed(handle);
      } catch {
        setFailMessage(t('social.share.couldNotFollow'));
        setState('failed');
      }
    },
    [onFollowed, ownWallet, showInvalidHint, stopScanner, t, toggleFollow]
  );

  const startScanning = useCallback(async () => {
    handledRef.current = false;
    setInvalidHint(false);
    setState('requesting');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      // Wait one tick so the scan-region div below has painted.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const scanner = new Html5Qrcode(SCAN_REGION_ID, /* verbose */ false);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10 },
        (decodedText: string) => void handleDecoded(decodedText),
        () => {
          // Per-frame "no QR in frame" callback — extremely noisy, intentional no-op.
        }
      );
      setState('scanning');
      timeoutRef.current = setTimeout(() => {
        void stopScanner();
        setState('noQr');
      }, SCAN_TIMEOUT_MS);
    } catch {
      await stopScanner();
      setState('denied');
    }
  }, [handleDecoded, stopScanner]);

  const cancelScan = useCallback(async () => {
    await stopScanner();
    setState('idle');
  }, [stopScanner]);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative w-full aspect-square overflow-hidden rounded-2xl bg-black border-2 border-black border-b-4">
        {/* html5-qrcode mounts its <video> feed inside this region. */}
        <div
          id={SCAN_REGION_ID}
          className={`absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover ${
            state === 'scanning' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Idle / requesting / outcome placeholder. */}
        {state !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
            {state === 'noQr' || state === 'failed' ? (
              <FiAlertCircle className="h-10 w-10 opacity-80" />
            ) : (
              <FiCamera className="h-10 w-10 opacity-80" />
            )}
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">
              {state === 'idle' && t('social.share.cameraOff')}
              {state === 'requesting' && t('social.share.requestingAccess')}
              {state === 'processing' && t('social.share.addingFriend')}
              {state === 'success' && t('social.share.qrDetected')}
              {state === 'denied' && t('social.share.cameraBlocked')}
              {state === 'noQr' && t('social.share.noQrDetected')}
              {state === 'failed' && failMessage}
            </p>
            {state === 'noQr' && (
              <p className="text-[11px] leading-relaxed opacity-60">
                {t('social.share.noQrDetectedBody')}
              </p>
            )}
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

      {/* Caption — swaps to a warning while an unrecognized QR is in frame. */}
      {invalidHint && state === 'scanning' ? (
        <p
          role="status"
          className="text-center text-xs font-semibold text-amber-700 max-w-[16rem] leading-relaxed"
        >
          {t('social.share.invalidQr')}
        </p>
      ) : (
        <p className="text-center text-xs text-gray-600 max-w-[16rem] leading-relaxed">
          {t('social.share.scanCaption')}
        </p>
      )}

      {/* Primary action — varies with state */}
      {state === 'idle' && (
        <button
          type="button"
          onClick={() => void startScanning()}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-xs font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5"
        >
          <FiCamera className="h-4 w-4" />
          {t('social.share.startScanning')}
        </button>
      )}
      {state === 'scanning' && (
        <button
          type="button"
          onClick={() => void cancelScan()}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-white text-black border border-black border-b-3 text-xs font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5"
        >
          {t('common.cancel')}
        </button>
      )}
      {(state === 'denied' || state === 'noQr' || state === 'failed') && (
        <button
          type="button"
          onClick={() => void startScanning()}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-md bg-white text-black border border-black border-b-3 text-xs font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5"
        >
          {state === 'denied' ? t('social.share.tryAgain') : t('social.share.scanAgain')}
        </button>
      )}
      {state === 'success' && (
        <>
          <div className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#DCFFE0] border border-[#9ED36A] py-2.5 text-xs font-extrabold uppercase tracking-wider text-black">
            <FiUserPlus className="h-4 w-4" />
            {t('social.share.followingHandle', { handle: resultHandle })}
          </div>
          <button
            type="button"
            onClick={() => void startScanning()}
            className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-md bg-white text-black border border-black border-b-2 text-[11px] font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5"
          >
            {t('social.share.scanAgain')}
          </button>
        </>
      )}

      {/* Secondary — upload image w/ a QR (mocked, kept disabled for now) */}
      <button
        type="button"
        disabled
        className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-md bg-white text-gray-400 border border-black/20 text-[11px] font-extrabold uppercase tracking-wider opacity-70 cursor-not-allowed"
      >
        <FiImage className="h-3.5 w-3.5" />
        {t('social.share.uploadFromGallery')}
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
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const [tab, setTab] = useState<TabKey>('mine');

  // Reset to the default tab every time the modal opens.
  useEffect(() => {
    if (open) setTab('mine');
  }, [open]);

  // Unique per user: the QR (and share/copy links) encode a follow deep link
  // carrying the viewer's wallet, so scanning it identifies *this* vaquero.
  const url = useMemo(() => {
    if (profileUrl) return profileUrl;
    if (typeof window !== 'undefined') {
      if (walletAddress) return buildFollowUrl(window.location.origin, walletAddress);
      return window.location.href;
    }
    return 'https://vaquita.finance';
  }, [profileUrl, walletAddress]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('social.share.linkCopied'));
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      toast.danger(t('social.share.couldNotCopy'), { description: message });
    }
  };

  const handleNativeShare = async () => {
    try {
      if (typeof navigator !== 'undefined' && (navigator as Navigator & { share?: unknown }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: t('social.share.shareTitle', { name: displayName }),
          text: t('social.share.shareText', { name: displayName }),
          url,
        });
        return;
      }
      await handleCopy();
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      if (message && !message.toLowerCase().includes('abort')) {
        toast.danger(t('social.share.couldNotShare'), { description: message });
      }
    }
  };

  const handleFollowed = (scannedHandle: string) => {
    toast.success(t('social.share.nowFollowing', { handle: scannedHandle }));
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
      <Modal.Container
        size="full"
        placement="bottom"
        scroll="inside"
        className="p-0! m-0! sm:items-center sm:justify-center sm:p-4!"
      >
        <Modal.Dialog
          aria-label={tab === 'mine' ? t('social.share.dialogLabelMine') : t('social.share.dialogLabelScan')}
          className="bg-background m-0! p-0! rounded-t-3xl sm:rounded-3xl border-0 max-h-dvh sm:max-h-[90vh] sm:max-w-md sm:w-full sm:mx-auto data-[exiting=true]:duration-300"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className="flex flex-col h-full min-h-dvh w-full sm:min-h-0 sm:h-auto sm:max-h-[90vh]"
          >
            {/* Header — X on the left, drag handle in the middle, spacer on
                the right to keep the handle visually centered. Mirrors the
                AchievementModal top bar. */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={t('common.close')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
              <span className="h-1.5 w-12 rounded-full bg-black/15 sm:hidden" aria-hidden />
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
                  <ScanQrView ownWallet={walletAddress ?? null} onFollowed={handleFollowed} />
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
                    {t('social.share.shareLink')}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-white hover:bg-white/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
                  >
                    <FiCopy className="h-4 w-4" />
                    {t('social.share.copyLink')}
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
