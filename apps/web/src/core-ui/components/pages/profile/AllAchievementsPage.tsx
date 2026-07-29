'use client';

import { useMemo, useState } from 'react';
import { FiGift } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { CircleIconButton } from '../../molecules/CircleIconButton';
import { PageHeader } from '../../molecules/PageHeader';
import { getDepositsData } from '../../../helpers/deposits';
import {
  useClaimedAchievements,
  useDepositsComplete,
  useFollowCounts,
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
  const { t } = useTranslation();
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
  const { data: followCounts } = useFollowCounts();
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
    () => achievementsData?.achievements?.find((a) => a.key === 'beta_tester'),
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
        friendsCount: followCounts?.following ?? 0,
      }),
    [totalStreak, totalDeposits, experience, activeDepositsTotalAmount, betaTester, achievementsData?.achievements, followCounts?.following]
  );

  const earned = achievements.filter((b) => b.unlocked && isClaimed(b.id)).length;
  const today = useMemo(() => formatDate(new Date().toISOString()), []);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-6 pb-16">
        {/* Header estándar (PageHeader) con el botón de canjear código a la derecha. */}
        <PageHeader
          title={t('achievements.page.title', 'Achievements')}
          backHref="/profile"
          className="border-b border-black/10 pb-3"
          rightSlot={
            <CircleIconButton
              variant="white"
              ariaLabel={t('achievements.page.redeemCode', 'Redeem code')}
              onClick={() => setRedeemOpen(true)}
              icon={<FiGift className="h-4 w-4" />}
            />
          }
        />

        {/* Personal records ----------------------------------------- */}
        <section className="flex flex-col gap-3">
          <h2 className="text-base sm:text-lg font-extrabold text-black px-1">
            {t('achievements.page.personalRecords', 'Personal records')}
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
            {t('achievements.page.awards', 'Awards')}
          </h2>
          <div className="rounded-2xl border border-black border-b-2 bg-white p-4 sm:p-6">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 sm:gap-6 place-items-center">
              {achievements.map((badge) => (
                <BadgeTile
                  key={badge.id}
                  badge={badge}
                  size="lg"
                  showTitle
                  claimable={(badge.claimState === 'pending_mint' || badge.unlocked) && !isClaimed(badge.id)}
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
