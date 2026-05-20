'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { Modal, toast } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { FiShare2, FiX } from 'react-icons/fi';
import { useClaimedAchievements, useIsMobile, useMintBadge, useMintedBadges, useProfileRewards } from '../../../hooks';
import { useNetworkConfigStore } from '../../../stores';

/**
 * Mocked username used to personalize the share link. Replace with a real
 * value when the user/profile hook exposes one (e.g. `useProfile().username`).
 * The OG endpoint reads it from the `u` query param and prints it on the
 * card; if it's empty the card still renders, just without the byline.
 */
const MOCK_USERNAME = 'vaquero';

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
};

interface AchievementModalProps {
  achievement: AchievementDetail | null;
  /** Whether the user has met the achievement's unlock condition. */
  unlocked?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Mocked reward table — backend will return the real amount per achievement. */
const TIER_REWARD: Record<string, number> = {
  Bronze: 25,
  Silver: 50,
  Gold: 100,
  Diamond: 250,
  Founder: 500,
};

const rewardFor = (achievement: AchievementDetail): number =>
  (achievement.tier ? TIER_REWARD[achievement.tier] : undefined) ?? 25;

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Short form matches the Duolingo reference ("NOV 4, 2021") and reads
  // well in the small uppercase pill.
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

type Phase = 'detail' | 'claiming' | 'reward' | 'minting' | 'minted';

/* ------------------------------------------------------------------ */
/* Blinking-dots loader                                                */
/* ------------------------------------------------------------------ */

function VaquitaDots() {
  return (
    <div className="flex items-center gap-2" role="status" aria-label="Claiming reward">
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

export function AchievementModal({
  achievement,
  unlocked = false,
  open,
  onOpenChange,
}: AchievementModalProps) {
  const { isClaimed, claim } = useClaimedAchievements();
  const { isMinted } = useMintedBadges();
  const mintBadgeMutation = useMintBadge();
  const { network, walletAddress } = useNetworkConfigStore();
  const networkName = network?.name ?? '';
  const baseUrl = `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1`;
  const { data: rewardsData } = useProfileRewards();
  // Drives whether we render the full-screen bottom-sheet (phone-sized) or
  // the compact centered dialog (everything wider than the Tailwind `sm`
  // breakpoint). Server-render returns `false`, matching the desktop shell
  // we ship into, so the hydration pass doesn't flicker.
  const isMobile = useIsMobile();
  // Visual-only running tally so the balance ticks up the moment a claim
  // completes (the real `useProfileRewards` query refetches in the background).
  const baseGoldCoins =
    rewardsData?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const [bonusGold, setBonusGold] = useState(0);
  const goldCoins = baseGoldCoins + bonusGold;
  const [phase, setPhase] = useState<Phase>('detail');
  const [sharing, setSharing] = useState(false);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  // True when the user pressed "Mint Badge On-Chain" and the reward phase
  // should flow into minting rather than back to the detail view.
  const [mintFlowPending, setMintFlowPending] = useState(false);

  // Reset to the detail phase every time the modal opens so a previous
  // claim-flow doesn't leak into the next achievement view.
  useEffect(() => {
    if (open) {
      setPhase('detail');
      setBonusGold(0);
      setMintTxHash(null);
      setMintFlowPending(false);
    }
  }, [open, achievement?.id]);

  // Fire the mint mutation when entering the minting phase.
  useEffect(() => {
    if (phase !== 'minting' || !achievement) return;
    mintBadgeMutation.mutate(achievement.id, {
      onSuccess: ({ hash }) => {
        setMintTxHash(hash);
        setPhase('minted');
      },
      onError: (err) => {
        toast.danger('Mint failed', { description: err.message });
        setPhase('detail');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const reward = useMemo(() => (achievement ? rewardFor(achievement) : 0), [achievement]);
  const claimed = !!achievement && isClaimed(achievement.id);

  if (!achievement) return null;

  const progressPct = achievement.progress
    ? Math.min(100, Math.round((achievement.progress.current / achievement.progress.target) * 100))
    : null;

  // Claim-only flow (no badge contract configured on this network).
  const handleClaim = async () => {
    setPhase('claiming');
    try {
      const result = await claim(achievement.id);
      setBonusGold((v) => v + (result?.coinReward ?? reward));
      setPhase('reward');
    } catch (err) {
      const message = (err as Error)?.message ?? 'Unknown error';
      toast.danger('Could not claim award', { description: message });
      setPhase('detail');
    }
  };

  // Unified mint flow: claim off-chain first, then show coins, then Pollar.
  const handleMintClick = async () => {
    if (!achievement) return;
    setMintFlowPending(true);
    setPhase('claiming');
    try {
      const res = await fetch(
        `${baseUrl}/profile/network/${encodeURIComponent(networkName)}/wallet/${encodeURIComponent(walletAddress)}/achievements/${encodeURIComponent(achievement.id)}/claim`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.ok && res.status !== 409) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to claim (${res.status})`);
      }
      if (res.status === 409) {
        // Already claimed — skip coin animation, go straight to Pollar prompt
        setPhase('minting');
      } else {
        const body = await res.json().catch(() => null);
        const coinReward: number = body?.data?.coinReward ?? reward;
        setBonusGold((v) => v + coinReward);
        setPhase('reward');
      }
    } catch (err) {
      setMintFlowPending(false);
      toast.danger('Could not start mint', { description: (err as Error)?.message ?? 'Unknown error' });
      setPhase('detail');
    }
  };

  const handleContinue = () => {
    if (mintFlowPending) {
      setPhase('minting');
    } else {
      setPhase('detail');
    }
  };

  const shareText = `I just unlocked "${achievement.title}" on Vaquita 🐮`;

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
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://vaquita.finance';
    const qs = new URLSearchParams();
    if (MOCK_USERNAME) qs.set('u', MOCK_USERNAME);
    if (achievement.date) qs.set('date', achievement.date);
    const query = qs.toString();
    return `${origin}/share/achievement/${achievement.id}${query ? `?${query}` : ''}`;
  };

  /**
   * Native share — hand text + the public share URL to the OS share sheet.
   * Receiving apps (X, WhatsApp, Telegram, …) fetch the URL's OG metadata
   * and render the image inline, so the post lands image-rich without us
   * ever shipping a PNG. Falls back to clipboard when the Web Share API
   * isn't available (older desktop browsers).
   */
  const handleNativeShare = async () => {
    setSharing(true);
    try {
      const shareUrl = buildShareUrl();
      const nav = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
      };
      const payload: ShareData = { title: achievement.title, text: shareText, url: shareUrl };
      if (nav.share) {
        await nav.share(payload);
        return;
      }
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      toast.success('Link copied to clipboard');
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
      const isCancel =
        name === 'AbortError' ||
        message.includes('abort') ||
        message.includes('cancel'); // catches "canceled" and "cancelled"
      if (!isCancel) {
        toast.danger('Could not share', { description: err?.message ?? 'Unknown error' });
      }
    } finally {
      setSharing(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Phase: claiming                                                     */
  /* ------------------------------------------------------------------ */
  const renderClaiming = () => (
    <motion.div
      key="claiming"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
    >
      <div className="relative h-32 w-32 opacity-90">
        <Image
          src={achievement.icon}
          alt=""
          fill
          sizes="128px"
          className="object-contain grayscale-[40%] animate-pulse"
        />
      </div>
      <VaquitaDots />
      <p className="text-sm font-bold uppercase tracking-wider text-gray-500">Claiming reward</p>
    </motion.div>
  );

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
          className="text-2xl sm:text-3xl font-extrabold text-black text-center"
        >
          You earned {reward} coins!
        </motion.h2>
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.18 }}
          className="text-sm text-gray-600 text-center max-w-xs"
        >
          {achievement.title} is now in your trophy room.
        </motion.p>
      </div>
      <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
        <button
          type="button"
          onClick={handleContinue}
          className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
        >
          Continue
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
        <Image
          src={achievement.icon}
          alt=""
          fill
          sizes="128px"
          className="object-contain grayscale animate-pulse"
        />
      </div>
      <VaquitaDots />
      <p className="text-sm font-bold uppercase tracking-wider text-gray-500">Waiting for wallet…</p>
    </motion.div>
  );

  /* ------------------------------------------------------------------ */
  /* Phase: minted (on-chain confirmed)                                 */
  /* ------------------------------------------------------------------ */
  const renderMinted = () => {
    const explorerNetwork = network?.type === 'mainnet' ? 'mainnet' : 'testnet';
    const explorerUrl = mintTxHash
      ? `https://stellar.expert/explorer/${explorerNetwork}/tx/${mintTxHash}`
      : null;
    const shortHash = mintTxHash
      ? `${mintTxHash.slice(0, 6)}…${mintTxHash.slice(-4)}`
      : null;

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
              alt={achievement.title}
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
            Badge minted on-chain!
          </motion.h2>
          {explorerUrl && shortHash && (
            <motion.a
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.18 }}
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-primary underline underline-offset-2 hover:text-primary/80 transition"
            >
              {shortHash}
            </motion.a>
          )}
        </div>
        <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
          >
            Done
          </button>
        </div>
      </motion.div>
    );
  };

  /* ------------------------------------------------------------------ */
  /* Phase: detail                                                       */
  /* ------------------------------------------------------------------ */
  const renderDetail = () => {
    const hasBadgesContract = !!network?.badgesContractAddress;
    // Claim-only: no on-chain badge contract configured.
    const canClaim = unlocked && !claimed && !hasBadgesContract;
    // Unified mint: single button covers both the off-chain claim and on-chain mint.
    const canMintUnified = ((unlocked && !claimed) || (claimed && !isMinted(achievement.id))) && hasBadgesContract;
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
                background:
                  achievement.accent ?? 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
              }}
            />
            <Image
              src={achievement.icon}
              alt={achievement.title}
              fill
              sizes="(min-width: 640px) 192px, 160px"
              className={`relative object-contain drop-shadow-2xl ${
                unlocked ? '' : 'grayscale opacity-70'
              }`}
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
            <h2 className="text-xl sm:text-2xl font-extrabold text-black">{achievement.title}</h2>
            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
              {achievement.description}
            </p>
          </div>

          {progressPct !== null && !claimed && (
            <div className="w-full max-w-md flex flex-col gap-1.5 mt-1">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                <span>Progress</span>
                <span className="tabular-nums">
                  {achievement.progress!.current} / {achievement.progress!.target}
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

        {/* Bottom CTA — only when there's something actionable. */}
        {(canClaim || canMintUnified) && (
          <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
            {canClaim && (
              <button
                type="button"
                onClick={handleClaim}
                className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
              >
                Claim award
              </button>
            )}
            {canMintUnified && (
              <button
                type="button"
                onClick={claimed ? () => setPhase('minting') : () => { void handleMintClick(); }}
                className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-black hover:bg-black/80 text-white border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
              >
                Mint badge on-chain
              </button>
            )}
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
            className={`flex flex-col w-full ${isMobile ? 'h-full min-h-dvh' : 'h-full'}`}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition"
              >
                <FiX className="h-5 w-5" />
              </button>
              <span
                className={`h-1.5 w-12 rounded-full bg-black/15 ${isMobile ? '' : 'invisible'}`}
                aria-hidden
              />
              {phase === 'reward' || phase === 'claiming' || phase === 'minting' ? (
                // Duolingo-style coin balance — only meaningful on the reward
                // reveal (and the loading step into it), so we mount it there
                // exclusively. Animates in once the bonus has landed.
                <motion.div
                  key={goldCoins}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white border border-black border-b-2 px-3 text-black"
                  aria-label={`${goldCoins} gold coins`}
                >
                  <Image
                    src="/icons/global/coin.png"
                    alt=""
                    width={18}
                    height={18}
                    className="object-contain"
                  />
                  <span className="text-sm font-extrabold tabular-nums">
                    {goldCoins.toLocaleString()}
                  </span>
                </motion.div>
              ) : showHeaderShare ? (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  disabled={sharing}
                  aria-label="Share achievement"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
                >
                  <FiShare2 className="h-4 w-4" />
                </button>
              ) : (
                <span className="w-10" />
              )}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {phase === 'claiming' && renderClaiming()}
              {phase === 'reward' && renderReward()}
              {phase === 'minting' && renderMinting()}
              {phase === 'minted' && renderMinted()}
              {phase === 'detail' && renderDetail()}
            </AnimatePresence>
          </motion.div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
