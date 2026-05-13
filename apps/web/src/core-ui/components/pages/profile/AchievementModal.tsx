'use client';

import { Modal, toast } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import * as htmlToImage from 'html-to-image';
import Image from 'next/image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiShare2, FiX } from 'react-icons/fi';
import { useClaimedAchievements, useProfileRewards } from '../../../hooks';

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

type Phase = 'detail' | 'claiming' | 'reward' | 'share';

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
/* Share preview card — what gets posted to socials                    */
/* ------------------------------------------------------------------ */

/**
 * The visual that's posted to socials. Rendered into the modal preview AND
 * snapshotted to a PNG by `html-to-image` so the share actually carries an
 * image. Exposed via `forwardRef` so the share handlers can hand the same
 * node to the snapshotter without re-mounting a clone.
 */
const ShareCard = React.forwardRef<HTMLDivElement, { achievement: AchievementDetail }>(
  function ShareCard({ achievement }, ref) {
    return (
      <div
        ref={ref}
        className="relative w-full max-w-xs mx-auto rounded-3xl overflow-hidden bg-white border border-black border-b-2 shadow-lg"
      >
        <div className="relative flex flex-col items-center text-center px-6 pt-7 pb-6 gap-3">
          {/* Achievement art on its own subtle halo so it pops on white. */}
          <div className="relative flex h-36 w-36 items-center justify-center">
            <span
              aria-hidden
              className="absolute inset-4 rounded-full blur-2xl opacity-45"
              style={{
                background:
                  achievement.accent ?? 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)',
              }}
            />
            <Image
              src={achievement.icon}
              alt={achievement.title}
              fill
              sizes="144px"
              className="relative object-contain drop-shadow-md"
            />
          </div>

          <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">
            Achievement unlocked
          </p>
          <p className="text-2xl font-extrabold text-black leading-tight">{achievement.title}</p>
          <p className="text-xs text-gray-600 leading-snug max-w-[15rem]">
            {achievement.description}
          </p>

          {/* Bigger Vaquita lockup as a clean signoff at the bottom. */}
          <div className="mt-3 flex items-center gap-2 border-t border-black/10 pt-4 w-full justify-center">
            <Image
              src="/vaquita/vaquita_isotipo.svg"
              alt=""
              width={40}
              height={40}
              className="object-contain"
            />
            <span className="text-base font-extrabold tracking-tight text-black">Vaquita</span>
          </div>
        </div>
      </div>
    );
  }
);

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
  const { data: rewardsData } = useProfileRewards();
  // Visual-only running tally so the balance ticks up the moment a claim
  // completes (the real `useProfileRewards` query refetches in the background).
  const baseGoldCoins =
    rewardsData?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const [bonusGold, setBonusGold] = useState(0);
  const goldCoins = baseGoldCoins + bonusGold;
  const [phase, setPhase] = useState<Phase>('detail');
  const [generating, setGenerating] = useState(false);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  // Reset to the detail phase every time the modal opens so a previous
  // claim-flow doesn't leak into the next achievement view.
  useEffect(() => {
    if (open) {
      setPhase('detail');
      setBonusGold(0);
    }
  }, [open, achievement?.id]);

  const reward = useMemo(() => (achievement ? rewardFor(achievement) : 0), [achievement]);
  const claimed = !!achievement && isClaimed(achievement.id);

  /** Snapshot the on-screen `ShareCard` to a PNG file. Returns `null` when the
   *  ref isn't mounted yet (e.g. share triggered before the preview rendered)
   *  or when the browser can't paint the DOM to a canvas (very old Safari).
   *
   *  Defined *above* the `if (!achievement) return null` early-exit so the
   *  hook order stays stable between "no selection" and "open selection"
   *  renders. */
  const generateShareImage = useCallback(async (): Promise<File | null> => {
    if (!shareCardRef.current || !achievement) return null;
    // 2× pixel ratio so the PNG looks crisp on Retina / phone displays.
    const blob = await htmlToImage.toBlob(shareCardRef.current, {
      pixelRatio: 2,
      cacheBust: true,
      // The card itself paints a white background; setting it here too keeps
      // any transparent area (rounded-corner antialiasing) on the same color.
      backgroundColor: '#FFFFFF',
    });
    if (!blob) return null;
    return new File([blob], `vaquita-${achievement.id}.png`, { type: 'image/png' });
  }, [achievement]);

  if (!achievement) return null;

  const progressPct = achievement.progress
    ? Math.min(100, Math.round((achievement.progress.current / achievement.progress.target) * 100))
    : null;

  const handleClaim = () => {
    setPhase('claiming');
    // Mocked latency — replace with the real "claim" mutation when the
    // backend ships. Keep the loading screen visible long enough for the dots
    // animation to read as deliberate, not as jank. The bonus is added to
    // the visible gold balance when the reveal kicks in so the pill in the
    // header tracks what the user just earned.
    window.setTimeout(() => {
      setBonusGold((v) => v + reward);
      setPhase('reward');
    }, 1500);
  };

  const handleContinue = () => {
    claim(achievement.id);
    setPhase('detail');
  };

  const shareText = `I just unlocked "${achievement.title}" on Vaquita 🐮`;
  const shareUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://vaquita.finance';

  /**
   * Native share — first tries to hand off an actual PNG via the Web Share
   * Files API (works on iOS, Android, and modern Chromium desktop). When file
   * sharing isn't available we fall back to text + URL through the same share
   * sheet, and finally to clipboard.
   */
  const handleNativeShare = async () => {
    setGenerating(true);
    try {
      const file = await generateShareImage();
      const nav = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
        canShare?: (data: ShareData) => boolean;
      };
      const payload: ShareData = file
        ? { files: [file], title: achievement.title, text: shareText, url: shareUrl }
        : { title: achievement.title, text: shareText, url: shareUrl };

      if (nav.share && (!file || (nav.canShare?.(payload) ?? true))) {
        await nav.share(payload);
        return;
      }
      // No Web Share API at all → clipboard fallback.
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      toast.success('Link copied to clipboard');
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      if (message && !message.toLowerCase().includes('abort')) {
        toast.danger('Could not share', { description: message });
      }
    } finally {
      setGenerating(false);
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
  /* Phase: share preview                                                */
  /* ------------------------------------------------------------------ */
  const renderShare = () => (
    <motion.div
      key="share"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col"
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Preview · this is what your friends will see
        </p>
        <ShareCard ref={shareCardRef} achievement={achievement} />
      </div>
      <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
        {/* Single share CTA — the OS share sheet handles target selection
            (Instagram, X, WhatsApp, Telegram, Mail, …) and we hand it the
            generated PNG + reference text. */}
        <button
          type="button"
          onClick={handleNativeShare}
          disabled={generating}
          className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-wait disabled:hover:translate-y-0"
        >
          <FiShare2 className="h-4 w-4" />
          {generating ? 'Preparing…' : 'Share'}
        </button>
      </div>
    </motion.div>
  );

  /* ------------------------------------------------------------------ */
  /* Phase: detail                                                       */
  /* ------------------------------------------------------------------ */
  const renderDetail = () => {
    const canClaim = unlocked && !claimed;
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

        {/* Bottom CTA — only when there's something actionable. Locked rows
            don't get a button; the progress bar tells the story. */}
        {canClaim && (
          <div className="px-5 sm:px-10 pt-3 pb-6 bg-background border-t border-black/10">
            <button
              type="button"
              onClick={handleClaim}
              className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
            >
              Claim award
            </button>
          </div>
        )}
      </motion.div>
    );
  };

  // Top bar layout: X on the left, drag handle in the middle, share button on
  // the right (Duolingo-style) — but only when the user has actually claimed
  // this achievement.
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
      <Modal.Container size="full" placement="bottom" scroll="inside" className="p-0! m-0!">
        <Modal.Dialog className="bg-background m-0! p-0! rounded-t-3xl sm:rounded-t-[2rem] border-0 max-h-dvh data-[exiting=true]:duration-300">
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className="flex flex-col h-full min-h-dvh w-full"
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
              <span className="h-1.5 w-12 rounded-full bg-black/15" aria-hidden />
              {phase === 'reward' || phase === 'claiming' ? (
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
                  onClick={() => setPhase('share')}
                  aria-label="Share achievement"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:-translate-y-0.5 transition"
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
              {phase === 'share' && renderShare()}
              {phase === 'detail' && renderDetail()}
            </AnimatePresence>
          </motion.div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
