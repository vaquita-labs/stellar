'use client';

import { Modal, toast } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { FiCopy, FiDownload, FiShare2, FiX } from 'react-icons/fi';
import { FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { useTranslation } from 'react-i18next';
import {
  useClaimedAchievements,
  useIsMobile,
  useMintBadge,
  useMintedBadges,
  useProfileData,
  useProfileRewards,
} from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { stellarExpertTxUrl } from '@/networks/stellar/helpers';
import { parseBadgeMintError } from '@/networks/stellar/badgeErrors';

export type AchievementDetail = {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** ISO date string or display string for when it was unlocked. */
  date?: string;
  /** Tier label like "Level 3" or "Rubí". Optional. */
  tier?: string;
  /** Progress (current / target). When provided, a progress bar is rendered. */
  progress?: { current: number; target: number };
  /** Background color for the icon container. */
  accent?: string;
  claimState?: 'locked' | 'claimable' | 'pending_mint' | 'claimed' | 'minted';
};

interface AchievementModalProps {
  achievement: AchievementDetail | null;
  /** Whether the user has met the achievement's unlock condition. */
  unlocked?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Short form matches the Duolingo reference ("NOV 4, 2021") and reads
  // well in the small uppercase pill.
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

type Phase = 'detail' | 'reward' | 'minting' | 'minted';

/* ------------------------------------------------------------------ */
/* Blinking-dots loader                                                */
/* ------------------------------------------------------------------ */

function VaquitaDots() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2" role="status" aria-label={t('achievements.modal.claimingReward', 'Claiming reward')}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-3 w-3 rounded-full bg-primary border border-black"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function AchievementModal({ achievement, unlocked = false, open, onOpenChange }: AchievementModalProps) {
  const { t } = useTranslation();
  const { isClaimed } = useClaimedAchievements();
  const { isMinted, getMintTxHash } = useMintedBadges();
  const mintBadgeMutation = useMintBadge();
  const { network } = useConfigStore();
  const { data: rewardsData } = useProfileRewards();
  // "Crypto mode": power-user flag that opts the wallet into on-chain detail —
  // gates the stellar.expert link shown for already-minted badges.
  const { data: profile } = useProfileData();
  const cryptoMode = profile?.cryptoSavvy ?? false;
  // Printed on the shared card ("· @nickname") and forwarded on the share
  // link. Empty is fine — the card just renders without the byline.
  const username = profile?.nickname?.trim() ?? '';
  // Drives whether we render the full-screen bottom-sheet (phone-sized) or
  // the compact centered dialog (everything wider than the Tailwind `sm`
  // breakpoint). Server-render returns `false`, matching the desktop shell
  // we ship into, so the hydration pass doesn't flicker.
  const isMobile = useIsMobile();
  // The coin balance comes straight from the server query; claiming
  // invalidates `profile-rewards`, so it refetches and ticks up on its own.
  const goldCoins = rewardsData?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const [phase, setPhase] = useState<Phase>('detail');
  const [sharing, setSharing] = useState(false);
  // In-modal sheet listing explicit share targets (X, WhatsApp, copy,
  // download) — the OS share sheet orders apps by usage and can't be
  // influenced from the web, so the targets we care about get buttons.
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  // Web Share availability is a client-only fact — resolve it after mount so
  // the server and hydration passes render the same tree.
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  // Real coin reward returned by the mint flow's off-chain claim step; drives
  // the "You earned N coins!" reveal shown after a successful mint.
  const [coinReward, setCoinReward] = useState(0);

  // Reset to the detail phase every time the modal opens so a previous
  // claim-flow doesn't leak into the next achievement view.
  useEffect(() => {
    if (open) {
      setPhase('detail');
      setShareMenuOpen(false);
      setMintTxHash(null);
      setCoinReward(0);
      mintBadgeMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, achievement?.id]);

  // Fire the mint mutation synchronously from the user gesture. Bailing on
  // `isPending` keeps a double-click (or any stray re-trigger) from spawning
  // a second Freighter popup — useMutation does NOT dedupe in-flight calls
  // on its own. On success we reveal the earned coins, then the on-chain
  // confirmation screen.
  const triggerMint = () => {
    if (!achievement || mintBadgeMutation.isPending) return;
    setPhase('minting');
    mintBadgeMutation.mutate(achievement.id, {
      onSuccess: ({ hash, coinReward }) => {
        setMintTxHash(hash);
        setCoinReward(coinReward);
        setPhase('reward');
      },
      onError: (err) => {
        // Keep the raw HostError for debugging, but never show it to the user —
        // collapse it to a friendly, localized reason instead.
        console.error('[mintBadge] failed', err);
        const reason = parseBadgeMintError(err);
        toast.danger(t('achievements.toast.mintFailed', 'Mint failed'), {
          description: t(`achievements.mintError.${reason}`),
        });
        setPhase('detail');
      },
    });
  };

  const claimed = !!achievement && isClaimed(achievement.id);

  // Warm the story-format (9:16) share image while the user looks at the
  // modal, so the share tap can attach it instantly. Fetching on demand is
  // not an option: Safari revokes the user gesture (transient activation)
  // if `navigator.share` runs more than a few seconds after the tap.
  const shareFileRef = useRef<Promise<File | null> | null>(null);
  useEffect(() => {
    if (!open || !achievement || !claimed) {
      shareFileRef.current = null;
      return;
    }
    const qs = new URLSearchParams({ format: 'story' });
    if (username) qs.set('u', username);
    if (achievement.date) qs.set('date', achievement.date);
    shareFileRef.current = fetch(`/og/achievement/${achievement.id}?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const blob = await res.blob();
        return new File([blob], `vaquita-achievement-${achievement.id}.png`, { type: 'image/png' });
      })
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, claimed, username, achievement?.id, achievement?.date]);

  if (!achievement) return null;

  // Badge copy is backend-served; localize known built-in badges by id, with
  // the English title/description supplied with the data as the fallback.
  const title = t(`achievements.items.${achievement.id}.title`, achievement.title);
  const description = t(`achievements.items.${achievement.id}.description`, achievement.description);

  const progressPct = achievement.progress
    ? Math.min(100, Math.round((achievement.progress.current / achievement.progress.target) * 100))
    : null;

  // Shared stellar.expert tx linking, used by both the live mint confirmation
  // and the "already minted" detail view. The network segment comes from the
  // config provider (network.type) — single source of truth across the app.
  const txExplorerUrl = (hash: string) => stellarExpertTxUrl(hash, network?.type);
  const shortenHash = (hash: string) => `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  // "Mainnet"/"Testnet" are technical proper nouns, identical across locales.
  const networkLabel = network?.type === 'mainnet' ? 'Mainnet' : 'Testnet';

  // Compact tx row: title + clickable short hash (only the hash is the link) +
  // a chip flagging which Stellar network the tx lives on.
  const txHashRow = (hash: string) => (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-gray-600">
        {t('achievements.detail.viewOnStellarExpert', 'View on Stellar Expert')}
      </span>
      <a
        href={txExplorerUrl(hash)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-mono font-semibold text-primary underline underline-offset-2 hover:text-primary/80 transition"
      >
        {shortenHash(hash)}
      </a>
      <span className="text-[10px] font-bold uppercase tracking-wide bg-white text-gray-600 border border-black/20 rounded-full px-2 py-0.5">
        {networkLabel}
      </span>
    </div>
  );

  // Tx hash stored server-side for an already-minted badge. Only surfaced in
  // crypto mode, on the detail view of a badge the user previously minted.
  const storedTxHash = isMinted(achievement.id) ? getMintTxHash(achievement.id) : null;
  const showStoredTx = cryptoMode && !!storedTxHash;

  // Badges are always minted on-chain — there is no off-chain-only path. The
  // mint flow (useMintBadge) performs the off-chain reward claim as its first
  // step, then signs and mints; the reward reveal runs on success.
  const handleClaim = () => triggerMint();

  // From the reward reveal, advance to the on-chain confirmation screen.
  const handleContinue = () => setPhase('minted');

  const shareText = t('achievements.share.text', 'I just unlocked "{{title}}" on Vaquita 🐮', {
    title,
  });

  /**
   * Build the public share URL pointing at `/share/achievement/<id>`. Each
   * social platform that receives this URL scrapes its OG meta tags and
   * unfurls the server-rendered image from `/og/achievement/<id>` — no
   * client-side image generation involved.
   *
   * Personalization (`u`, `date`) is forwarded as query params; the OG
   * endpoint renders them into the card. Falls back to the production
   * origin during SSR so the URL is always absolute.
   */
  const buildShareUrl = (): string => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://vaquita.finance';
    const qs = new URLSearchParams();
    if (username) qs.set('u', username);
    if (achievement.date) qs.set('date', achievement.date);
    const query = qs.toString();
    return `${origin}/share/achievement/${achievement.id}${query ? `?${query}` : ''}`;
  };

  /**
   * Native share — three tiers, best supported one wins:
   *
   *  1. Web Share Level 2 (mobile): attach the pre-fetched 9:16 badge PNG as
   *     a `File` alongside text + the public URL. Image-first targets
   *     (Instagram Stories/feed, camera roll) receive the actual card;
   *     link-first targets (X, WhatsApp, Telegram) still unfurl the URL's
   *     OG image server-side.
   *  2. Web Share Level 1: text + URL only — receiving apps render the image
   *     from the URL's OG metadata.
   *  3. Clipboard (older desktop browsers): copy text + URL.
   *
   * The file wait is capped well under Safari's ~5 s transient-activation
   * window; if the prefetch hasn't landed yet we degrade to link-only
   * rather than risk a NotAllowedError.
   */
  const handleNativeShare = async () => {
    setSharing(true);
    try {
      const shareUrl = buildShareUrl();
      const nav = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.share) {
        const file = await Promise.race([
          shareFileRef.current ?? Promise.resolve(null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]);
        // Validate the exact payload — some browsers accept files but reject
        // the files+url combination, and canShare is the only way to know.
        const filePayload: ShareData = { files: file ? [file] : [], title, text: shareText, url: shareUrl };
        if (file && nav.canShare?.(filePayload)) {
          await nav.share(filePayload);
          return;
        }
        if (file && nav.canShare?.({ files: [file], title, text: shareText })) {
          // url is the unsupported member — share the image with the link
          // folded into the text so it isn't lost.
          await nav.share({ files: [file], title, text: `${shareText} ${shareUrl}` });
          return;
        }
        await nav.share({ title, text: shareText, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      toast.success(t('achievements.toast.linkCopied', 'Link copied to clipboard'));
    } catch (error) {
      // Treat user-cancel as a no-op. Browsers are inconsistent here:
      //  - Chromium / iOS Safari throw a `DOMException` with `name`
      //    `"AbortError"`.
      //  - Some Android WebViews / older Safaris throw a plain Error with a
      //    message like "Share canceled" / "Share cancelled" / "Abort due to
      //    cancellation of share.".
      // So we match on `name` *and* on a few message substrings before
      // deciding it was a real failure worth toasting about.
      const err = error as { name?: string; message?: string };
      const name = err?.name ?? '';
      const message = (err?.message ?? '').toLowerCase();
      const isCancel = name === 'AbortError' || message.includes('abort') || message.includes('cancel'); // catches "canceled" and "cancelled"
      if (!isCancel) {
        toast.danger(t('achievements.toast.couldNotShare', 'Could not share'), {
          description: err?.message ?? t('achievements.toast.unknownError', 'Unknown error'),
        });
      }
    } finally {
      setSharing(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Explicit share targets (share-menu sheet)                           */
  /* ------------------------------------------------------------------ */

  // X and WhatsApp have no way to receive a file from the web — their web
  // intents take text + URL only; the receiving side unfurls the image from
  // the share page's OG metadata.
  const handleShareToX = () => {
    const shareUrl = buildShareUrl();
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(false);
  };

  const handleShareToWhatsApp = () => {
    const shareUrl = buildShareUrl();
    const intent = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText} ${buildShareUrl()}`);
      toast.success(t('achievements.toast.linkCopied', 'Link copied to clipboard'));
    } catch {
      toast.danger(t('achievements.toast.couldNotShare', 'Could not share'));
    }
    setShareMenuOpen(false);
  };

  const handleDownloadImage = async () => {
    const file = await (shareFileRef.current ?? Promise.resolve(null));
    if (!file) {
      toast.danger(t('achievements.share.imageNotReady', 'Image not ready yet, try again'));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    setShareMenuOpen(false);
  };

  const shareMenuOptions: { key: string; label: string; icon: React.ReactNode; onClick: () => void }[] = [
    ...(canNativeShare
      ? [
          {
            key: 'native',
            label: t('achievements.share.shareImage', 'Share image…'),
            icon: <FiShare2 className="h-5 w-5" />,
            onClick: () => {
              setShareMenuOpen(false);
              void handleNativeShare();
            },
          },
        ]
      : []),
    // "X" and "WhatsApp" are proper nouns — no i18n needed.
    { key: 'x', label: 'X', icon: <FaXTwitter className="h-5 w-5" />, onClick: handleShareToX },
    { key: 'whatsapp', label: 'WhatsApp', icon: <FaWhatsapp className="h-5 w-5" />, onClick: handleShareToWhatsApp },
    {
      key: 'download',
      label: t('achievements.share.downloadImage', 'Download image'),
      icon: <FiDownload className="h-5 w-5" />,
      onClick: () => void handleDownloadImage(),
    },
    {
      key: 'copy',
      label: t('achievements.share.copyLink', 'Copy link'),
      icon: <FiCopy className="h-5 w-5" />,
      onClick: () => void handleCopyLink(),
    },
  ];

  /* ------------------------------------------------------------------ */
  /* Phase: reward reveal                                                */
  /* ------------------------------------------------------------------ */
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
          <Image src="/icons/global/coin.png" alt="" width={160} height={160} className="relative drop-shadow-xl" />
        </motion.div>
        <motion.h2
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-2xl sm:text-3xl font-extrabold text-black text-center"
        >
          {t('achievements.reward.title', 'You earned {{count}} coins!', { count: coinReward })}
        </motion.h2>
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.18 }}
          className="text-sm text-gray-600 text-center max-w-xs"
        >
          {t('achievements.reward.subtitle', '{{title}} is now in your trophy room.', {
            title,
          })}
        </motion.p>
      </div>
      <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
        <button
          type="button"
          onClick={handleContinue}
          disabled={mintBadgeMutation.isPending}
          className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
        >
          {t('common.continue')}
        </button>
      </div>
    </motion.div>
  );

  /* ------------------------------------------------------------------ */
  /* Phase: minting (waiting for Pollar wallet)                         */
  /* ------------------------------------------------------------------ */
  const renderMinting = () => (
    <motion.div
      key="minting"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
    >
      <div className="relative h-32 w-32">
        <Image src={achievement.icon} alt="" fill sizes="128px" className="object-contain grayscale animate-pulse" />
      </div>
      <VaquitaDots />
      <p className="text-sm font-bold uppercase tracking-wider text-gray-500">{t('achievements.minting.waitingForWallet', 'Waiting for wallet…')}</p>
    </motion.div>
  );

  /* ------------------------------------------------------------------ */
  /* Phase: minted (on-chain confirmed)                                 */
  /* ------------------------------------------------------------------ */
  const renderMinted = () => {
    return (
      <motion.div
        key="minted"
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
            className="relative flex h-40 w-40 sm:h-48 sm:w-48 items-center justify-center"
          >
            <span
              aria-hidden
              className="absolute inset-6 rounded-full blur-2xl opacity-60"
              style={{
                background: achievement.accent ?? 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
              }}
            />
            <Image
              src={achievement.icon}
              alt={title}
              fill
              sizes="(min-width: 640px) 192px, 160px"
              className="relative object-contain drop-shadow-2xl"
            />
          </motion.div>
          <motion.h2
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-2xl sm:text-3xl font-extrabold text-black text-center"
          >
            {t('achievements.minted.title', 'Badge minted on-chain!')}
          </motion.h2>
          {mintTxHash && (
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.18 }}
            >
              {txHashRow(mintTxHash)}
            </motion.div>
          )}
        </div>
        <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
          >
            {t('common.done')}
          </button>
        </div>
      </motion.div>
    );
  };

  /* ------------------------------------------------------------------ */
  /* Phase: detail                                                       */
  /* ------------------------------------------------------------------ */
  const renderDetail = () => {
    const canClaim = unlocked && !claimed && !!network?.badgesContractAddress;
    return (
      <motion.div
        key="detail"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex flex-col"
      >
        {/* Compact content — sized so it fits a single mobile screen without
            internal scrolling. */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4 gap-4">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="relative flex h-40 w-40 sm:h-48 sm:w-48 items-center justify-center"
          >
            <span
              aria-hidden
              className="absolute inset-6 rounded-full blur-2xl opacity-55"
              style={{
                background: achievement.accent ?? 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
              }}
            />
            <Image
              src={achievement.icon}
              alt={title}
              fill
              sizes="(min-width: 640px) 192px, 160px"
              className={`relative object-contain drop-shadow-2xl ${unlocked ? '' : 'grayscale opacity-70'}`}
            />
          </motion.div>

          {/* Small date pill — Duolingo-style. Replaces both the tier badge and
              the "Unlocked · ..." caption; the description below carries any
              remaining context. */}
          {achievement.date && (
            <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider bg-primary/30 text-[#7A3E00] rounded-full px-3 py-1">
              {formatDate(achievement.date)}
            </span>
          )}

          <div className="text-center max-w-md flex flex-col items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-black">{title}</h2>
            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">{description}</p>
          </div>

          {progressPct !== null && !claimed && (
            <div className="w-full max-w-md flex flex-col gap-1.5 mt-1">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                <span>{t('achievements.detail.progress', 'Progress')}</span>
                <span className="tabular-nums">
                  {Math.floor(achievement.progress!.current)} / {Math.floor(achievement.progress!.target)}
                </span>
              </div>
              <div className="h-2.5 w-full bg-white border border-black rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="h-full bg-primary"
                />
              </div>
            </div>
          )}
        </div>

        {canClaim && (
          <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
            <button
              type="button"
              onClick={handleClaim}
              className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
            >
              {t('achievements.detail.claimAward', 'Claim award')}
            </button>
          </div>
        )}

        {/* Crypto mode: surface the on-chain tx for an already-minted badge.
            Tapping the hash opens the transaction on stellar.expert in a new tab. */}
        {!canClaim && showStoredTx && storedTxHash && (
          <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
            {txHashRow(storedTxHash)}
          </div>
        )}
      </motion.div>
    );
  };

  // Top bar layout: X on the left, drag handle in the middle, share button on
  // the right (Duolingo-style) — but only when the user has actually claimed
  // this achievement and hasn't entered the minting flow.
  const showHeaderShare = phase === 'detail' && claimed;

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
        size={isMobile ? 'full' : 'md'}
        placement={isMobile ? 'bottom' : 'center'}
        scroll="inside"
        className={isMobile ? 'p-0! m-0!' : 'p-4!'}
      >
        {/* Desktop: we deliberately omit `m-0!` so heroui's `placement=center`
            rule (`margin-block: auto` on the dialog) keeps the modal centered
            vertically inside the flex container. Mobile keeps `m-0!` because
            the bottom-sheet should hug the bottom edge. */}
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
            className={`relative flex flex-col w-full ${isMobile ? 'h-full min-h-dvh' : 'h-full'}`}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={t('common.close')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
              <span className={`h-1.5 w-12 rounded-full bg-black/15 ${isMobile ? '' : 'invisible'}`} aria-hidden />
              {phase === 'reward' || phase === 'minting' ? (
                // Duolingo-style coin balance — only meaningful on the reward
                // reveal (and the loading step into it), so we mount it there
                // exclusively. Animates in once the bonus has landed.
                <motion.div
                  key={goldCoins}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white border border-black border-b-2 px-3 text-black"
                  aria-label={t('achievements.modal.goldCoins', '{{count}} gold coins', { count: goldCoins })}
                >
                  <Image src="/icons/global/coin.png" alt="" width={18} height={18} className="object-contain" />
                  <span className="text-sm font-extrabold tabular-nums">
                    {Math.floor(goldCoins).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </motion.div>
              ) : showHeaderShare ? (
                <button
                  type="button"
                  onClick={() => setShareMenuOpen(true)}
                  disabled={sharing}
                  aria-label={t('achievements.modal.shareAchievement', 'Share achievement')}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
                >
                  <FiShare2 className="h-4 w-4" />
                </button>
              ) : (
                <span className="w-10" />
              )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {phase === 'reward' && renderReward()}
              {phase === 'minting' && renderMinting()}
              {phase === 'minted' && renderMinted()}
              {phase === 'detail' && renderDetail()}
            </AnimatePresence>

            {/* Share-menu sheet: explicit targets layered over the modal */}
            <AnimatePresence>
              {shareMenuOpen && (
                <div className="absolute inset-0 z-20 flex flex-col justify-end overflow-hidden rounded-t-3xl">
                  <motion.button
                    type="button"
                    aria-label={t('common.close')}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShareMenuOpen(false)}
                    className="absolute inset-0 bg-black/40"
                  />
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                    className="relative bg-background rounded-t-3xl border-t border-black px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-2"
                  >
                    <p className="text-xs font-extrabold uppercase tracking-wider text-gray-600 text-center pb-1">
                      {t('achievements.share.menuTitle', 'Share badge')}
                    </p>
                    {shareMenuOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={option.onClick}
                        disabled={sharing}
                        className="h-12 w-full inline-flex items-center gap-3 rounded-md bg-white border border-black border-b-2 px-4 text-sm font-bold text-black hover:-translate-y-0.5 transition disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
                      >
                        {option.icon}
                        {option.label}
                      </button>
                    ))}
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
