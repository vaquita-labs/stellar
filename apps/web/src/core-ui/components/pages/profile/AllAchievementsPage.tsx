'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FiArrowLeft, FiGift } from 'react-icons/fi';
import { getDepositsData } from '../../../helpers/deposits';
import {
  useCatalogAchievements,
  useClaimedAchievements,
  useDepositsComplete,
  useLeaderboardRank,
  useProfileAchievements,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
} from '../../../hooks';
import { buildAchievements } from '../../../data/profile-badges';
import { useConfigStore } from '../../../stores';
import { AchievementDetail, AchievementModal } from './AchievementModal';
import { BadgeTile } from './BadgeTile';
import { PersonalRecords } from './PersonalRecords';
import { RedeemCodeModal } from './RedeemCodeModal';

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

  const { walletAddress } = useConfigStore();
  const { data: streakData } = useProfileStreak();
  const { data: experienceData } = useProfileExperience();
  const { data: rewardsData } = useProfileRewards();
  const { data: depositsData } = useDepositsComplete(walletAddress);
  const { data: achievementsData } = useProfileAchievements();
  const { data: catalogData } = useCatalogAchievements();
  const { data: rankData, isLoading: rankLoading } = useLeaderboardRank();
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
        catalog: catalogData,
        leaderboardRank: rankData?.rank ?? undefined,
      }),
    [totalStreak, totalDeposits, experience, activeDepositsTotalAmount, betaTester, achievementsData?.achievements, catalogData, rankData?.rank]
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
          <PersonalRecords
            totalStreak={totalStreak}
            experience={experience}
            totalDeposits={totalDeposits}
            goldCoins={goldCoins}
            earned={earned}
            totalAchievements={achievements.length}
            date={today}
          />
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
                  claimable={badge.unlocked && !isClaimed(badge.id)}
                  loading={rankLoading && ['first-place', 'second-place', 'third-place'].includes(badge.id)}
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
