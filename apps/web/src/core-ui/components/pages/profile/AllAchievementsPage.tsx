'use client';

import { useSearchParams } from 'next/navigation';
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
  useGoBack,
  useProfileAchievements,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
} from '../../../hooks';
import { buildAchievements } from '../../../data/profile-badges';
import { useConfigStore } from '../../../stores';
import { AchievementModal } from './AchievementModal';
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
  // Only the id is held: the modal reads its row out of the live `achievements`
  // list below, so a signal that lands while the sheet is open (the follow count
  // behind "Crew Mate", a deposit, the streak) reaches it. Storing the row
  // itself would freeze the badge as it looked at the moment of the tap —
  // an award unlocked a beat later would keep rendering its locked progress
  // and never offer its Claim button.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  // A notification ("Trophy unlocked!") lands here with `?badge=`: the badge it
  // is about opens on arrival, instead of leaving the user to guess which tile
  // of the grid it was. Once closed it stays closed.
  const badgeParam = useSearchParams().get('badge');
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  // Reached from the profile or from a notification: back returns to either.
  const goBack = useGoBack('/profile');

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

  // Resolved on every render from the list above, so the open sheet shows the
  // badge as it is now rather than as it was when the tile was tapped.
  // `badgeParam` is the badge key, or its name when the notification only
  // carries that (the feed stored a plain /profile/achievements before the key
  // was added to the link). It resolves against the live list too, so a badge
  // that only exists in the server catalog opens as soon as that loads.
  const deepLinkedId = useMemo(() => {
    if (!badgeParam || deepLinkDismissed) return null;
    const wanted = badgeParam.trim().toLowerCase();
    const byName = achievementsData?.achievements?.find((a) => a.name.toLowerCase() === wanted)?.key;
    return (
      achievements.find((b) => b.id.toLowerCase() === wanted || b.id === byName || b.title.toLowerCase() === wanted)?.id ??
      null
    );
  }, [badgeParam, deepLinkDismissed, achievements, achievementsData?.achievements]);
  const openId = selectedId ?? deepLinkedId;
  const selected = openId ? (achievements.find((b) => b.id === openId) ?? null) : null;

  const earned = achievements.filter((b) => b.unlocked && isClaimed(b.id)).length;
  const today = useMemo(() => formatDate(new Date().toISOString()), []);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-6 flex flex-col gap-6 pb-16">
        {/* Header estándar (PageHeader) con el botón de canjear código a la derecha. */}
        <PageHeader
          title={t('achievements.page.title', 'Achievements')}
          onBack={goBack}
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
                  onPress={() => setSelectedId(badge.id)}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <AchievementModal
        achievement={selected ?? null}
        unlocked={selected?.unlocked ?? false}
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedId(null);
            setDeepLinkDismissed(true);
          }
        }}
      />

      <RedeemCodeModal open={redeemOpen} onOpenChange={setRedeemOpen} />
    </div>
  );
}
