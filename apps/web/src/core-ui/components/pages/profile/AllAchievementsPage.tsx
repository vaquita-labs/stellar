'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import { FiArrowLeft, FiGift } from 'react-icons/fi';
import { getDepositsData } from '../../../helpers/deposits';
import {
  useClaimedAchievements,
  useDepositsComplete,
  useProfileAchievements,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
} from '../../../hooks';
import { buildAchievements } from '../../../data/profile-badges';
import { useNetworkConfigStore } from '../../../stores';
import { AchievementDetail, AchievementModal } from './AchievementModal';
import { BadgeTile } from './BadgeTile';
import { RedeemCodeModal } from './RedeemCodeModal';

/* ------------------------------------------------------------------ */
/* Personal record card                                                */
/* ------------------------------------------------------------------ */

interface RecordCardProps {
  icon: string;
  /** CSS background applied to the image panel. */
  background: string;
  title: string;
  value: React.ReactNode;
  date: string;
}

/**
 * Picture-forward record: a soft outlined frame (no fill) wraps the medal art
 * and its caption. The colored halo blooms behind the artwork so each tile
 * reads as a poster, not as a card.
 */
function RecordCard({ icon, background, title, value, date }: RecordCardProps) {
  return (
    <div className="shrink-0 w-40 sm:w-44 snap-start rounded-3xl border border-black/10 px-3 pt-3 pb-3 flex flex-col items-center gap-1.5">
      <div className="relative w-full aspect-square flex items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-3 rounded-full blur-2xl opacity-65"
          style={{ background }}
        />
        <Image
          src={icon}
          alt={title}
          width={240}
          height={240}
          className="relative h-full w-full object-contain drop-shadow-md"
        />
      </div>
      <div className="flex flex-col items-center text-center min-w-0 w-full leading-tight">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 truncate w-full">
          {title}
        </span>
        <span className="text-xl font-extrabold text-black tabular-nums leading-none mt-0.5">
          {value}
        </span>
        <span className="text-[10px] text-gray-400 leading-none mt-1">{date}</span>
      </div>
    </div>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function AllAchievementsPage() {
  // The detail modal needs both the catalog row (for display) and whether the
  // user has met the unlock condition, so it can pick Claim vs progress UI.
  const [selected, setSelected] = useState<{
    achievement: AchievementDetail;
    unlocked: boolean;
  } | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);

  const { walletAddress } = useNetworkConfigStore();
  const { data: streakData } = useProfileStreak();
  const { data: experienceData } = useProfileExperience();
  const { data: rewardsData } = useProfileRewards();
  const { data: depositsData } = useDepositsComplete(walletAddress);
  const { data: achievementsData } = useProfileAchievements();
  // Drives the pulsing "ready to claim" halo on each badge tile. A badge is
  // claimable when the user has met the unlock condition (`badge.unlocked`)
  // but hasn't cashed in the coin reward yet.
  const { isClaimed } = useClaimedAchievements();

  const totalStreak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const experience = experienceData?.experience ?? 0;
  const goldCoins = rewardsData?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const { activeDeposits, activeDepositsTotalAmount } = getDepositsData(depositsData?.deposits ?? []);
  const totalDeposits = activeDeposits?.length ?? 0;

  const betaTester = useMemo(
    () => achievementsData?.achievements?.find((a) => a.key === 'beta-tester'),
    [achievementsData?.achievements]
  );

  const achievements = useMemo(
    () =>
      buildAchievements({
        totalStreak,
        totalDeposits,
        experience,
        totalSavedAmount: activeDepositsTotalAmount,
        isBetaTester: betaTester?.unlocked ?? false,
        betaTesterClaimedAt: betaTester?.claimedAt ?? undefined,
        extraAchievements: achievementsData?.achievements,
      }),
    [totalStreak, totalDeposits, experience, activeDepositsTotalAmount, betaTester, achievementsData?.achievements]
  );

  const earned = achievements.filter((b) => b.unlocked && isClaimed(b.id)).length;
  const today = useMemo(() => formatDate(new Date().toISOString()), []);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-6 pb-16">
        {/* Header — back arrow on the left, muted centered title (Duolingo-style),
            redeem-code button on the right. */}
        <header className="relative flex items-center justify-center min-h-10 border-b border-black/10 pb-3">
          <Link
            href="/profile"
            aria-label="Back"
            className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
          >
            <FiArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-base sm:text-lg font-bold text-gray-500 tracking-wide uppercase">
            Achievements
          </h1>
          <button
            type="button"
            onClick={() => setRedeemOpen(true)}
            aria-label="Redeem code"
            title="Canjear código"
            className="absolute right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white border border-black border-b-2 text-black hover:bg-white/80 transition"
          >
            <FiGift className="h-4 w-4" />
          </button>
        </header>

        {/* Personal records ----------------------------------------- */}
        <section className="flex flex-col gap-3">
          <h2 className="text-base sm:text-lg font-extrabold text-black px-1">
            Personal records
          </h2>
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.3)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-black/30 [&::-webkit-scrollbar-thumb]:rounded-full snap-x"
            aria-label="Personal records"
          >
            {/*
              `icon` paths below currently point at the achievement medallions
              you already generated, so the design is fully visible while we
              wait for dedicated records art. The intended final paths are
              `/icons/records/<id>.png` — swap each one once those PNGs land.
            */}
            <RecordCard
              icon="/icons/achievements/streak-master.png"
              background="linear-gradient(180deg, #FFB347 0%, #FF7A00 100%)"
              title="Day streak"
              value={`${totalStreak.toLocaleString()} ${totalStreak === 1 ? 'day' : 'days'}`}
              date={today}
            />
            <RecordCard
              icon="/icons/achievements/explorer.png"
              background="linear-gradient(180deg, #FFE082 0%, #F5A161 100%)"
              title="Total XP"
              value={experience.toLocaleString()}
              date={today}
            />
            <RecordCard
              icon="/icons/achievements/first-deposit.png"
              background="linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)"
              title="Active deposits"
              value={totalDeposits.toLocaleString()}
              date={today}
            />
            <RecordCard
              icon="/icons/achievements/first-place.png"
              background="linear-gradient(180deg, #FFE082 0%, #FFA000 100%)"
              title="Gold coins"
              value={goldCoins.toLocaleString()}
              date={today}
            />
            <RecordCard
              icon="/icons/achievements/beta-tester2.png"
              background="linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)"
              title="Awards earned"
              value={`${earned} / ${achievements.length}`}
              date={today}
            />
          </div>
        </section>

        {/* Awards --------------------------------------------------- */}
        <section className="flex flex-col gap-3">
          <h2 className="text-base sm:text-lg font-extrabold text-black px-1">
            Awards
          </h2>
          <div className="rounded-2xl border border-black border-b-2 bg-white p-4 sm:p-6">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 sm:gap-6 place-items-center">
              {achievements.map((badge) => (
                <BadgeTile
                  key={badge.id}
                  badge={badge}
                  size="lg"
                  showTitle
                  claimable={true /* TEST: force all badges claimable */}
                  onPress={() => setSelected({ achievement: badge, unlocked: badge.unlocked })}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <AchievementModal
        achievement={selected?.achievement ?? null}
        unlocked={selected?.unlocked ?? false}
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      />

      <RedeemCodeModal open={redeemOpen} onOpenChange={setRedeemOpen} />
    </div>
  );
}
