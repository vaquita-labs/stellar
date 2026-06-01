'use client';

import { getDepositsData } from '@/core-ui/helpers/deposits';
import { addUsdcTrustline } from '@/networks/stellar/sorobanTx';
import { Card, toast } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import { FiChevronRight, FiSettings, FiShare2, FiUserPlus } from 'react-icons/fi';
import {
  useCatalogAchievements,
  useClaimedAchievements,
  useDepositsComplete,
  useLeaderboardRank,
  useProfileAchievements,
  useProfileData,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
} from '../../hooks';
import { useHideBalance, useNetworkConfigStore } from '../../stores';
import { buildAchievements } from '../../data/profile-badges';
import { PageLayout } from '../molecules';
import { BadgeTile } from './profile/BadgeTile';
import { ShareProfileQrButton } from './profile/ShareProfileQrButton';

const DEFAULT_AVATAR = '/vaquita/vaquita_isotipo.svg';

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

const SectionHeader = ({
  title,
  count,
  href,
}: {
  title: string;
  count?: number;
  href?: string;
}) => {
  const trailing = (
    <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-black transition">
      {typeof count === 'number' && <span className="tabular-nums">{count}</span>}
      <FiChevronRight className="h-4 w-4" />
    </span>
  );
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-500">
        {title}
      </h2>
      {href ? (
        <Link href={href} aria-label={`See all ${title}`}>
          {trailing}
        </Link>
      ) : (
        trailing
      )}
    </div>
  );
};

const StatPill = ({ value, label }: { value: React.ReactNode; label: string }) => (
  <div className="flex flex-col items-center min-w-0 flex-1">
    <span className="text-lg sm:text-xl font-extrabold text-black tabular-nums leading-none">
      {value}
    </span>
    <span className="text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">
      {label}
    </span>
  </div>
);

const SummaryItem = ({
  icon,
  value,
  label,
}: {
  icon: string;
  value: React.ReactNode;
  label: string;
}) => (
  <div className="flex items-center gap-2.5">
    <Image src={icon} alt={label} width={28} height={28} className="object-contain" />
    <div className="flex flex-col leading-tight">
      <span className="text-sm font-extrabold text-black tabular-nums">{value}</span>
      <span className="text-[11px] font-semibold text-gray-500">{label}</span>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ProfilePage() {
  const router = useRouter();
  const { walletAddress, token } = useNetworkConfigStore();
  const hideBalance = useHideBalance();
  const { data: profileData } = useProfileData();
  const { data: streakData } = useProfileStreak();
  const { data: experienceData } = useProfileExperience();
  const { data: rewardsData } = useProfileRewards();
  const { data: depositsData } = useDepositsComplete(walletAddress);
  const { data: achievementsData } = useProfileAchievements();
  const { data: catalogData } = useCatalogAchievements();
  const { data: rankData, isLoading: rankLoading } = useLeaderboardRank();
  // Mirrors the trophy room: the preview badges should show the same
  // "ready to claim" pulse so the cue is consistent across both screens.
  const { isClaimed } = useClaimedAchievements();

  const totalStreak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const hasActiveStreak = !!streakData?.todayStreak;
  const experience = experienceData?.experience ?? 0;
  const goldCoins = rewardsData?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const { activeDeposits, activeDepositsTotalAmount } = getDepositsData(depositsData?.deposits ?? []);
  const totalDeposits = activeDeposits?.length ?? 0;

  const displayName = useMemo(() => {
    const nickname = profileData?.nickname?.trim();
    if (nickname) return nickname;
    const full = profileData?.fullName?.trim();
    if (full) return full;
    if (walletAddress) return `Vaquero ${walletAddress.slice(-4).toUpperCase()}`;
    return 'Vaquero';
  }, [profileData?.nickname, profileData?.fullName, walletAddress]);

  // Keep the handle exactly as the user typed it (no forced lowercase).
  const handle = useMemo(() => {
    const nickname = profileData?.nickname?.trim();
    if (nickname) return `@${nickname.replace(/\s+/g, '')}`;
    if (walletAddress) return `@vaquero${walletAddress.slice(-4)}`;
    return '@vaquero';
  }, [profileData?.nickname, walletAddress]);

  // We don't yet have a real "joined" date from the backend, so we show the
  // current month + year as a friendly placeholder ("joined May 2026").
  const joinedLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    []
  );

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

  /* -------------------------------------------------------------- */
  /* Disconnected state                                              */
  /* -------------------------------------------------------------- */
  if (!walletAddress) {
    return (
      <PageLayout title="Profile" backHref="/home">
        <Card className="border border-default-200/60 bg-white/80 shadow-sm backdrop-blur dark:border-default-100/40 dark:bg-default-50/80">
          <Card.Content className="flex flex-col gap-6 p-6 sm:p-10 text-center">
            <div className="space-y-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50">
                Connect your wallet
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Access your profile, metrics, and future achievements by connecting your wallet.
              </p>
            </div>
          </Card.Content>
        </Card>
      </PageLayout>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl pb-28 md:pb-12 flex flex-col gap-6">
        {/* Hero banner ------------------------------------------------ */}
        <header className="relative bg-primary px-4 sm:px-6 pt-5 pb-12 rounded-b-3xl border-b-2 border-black/10">
          {/* Top action row — Profile is reachable from the nav, so no back button. */}
          <div className="flex items-center justify-end gap-2">
            <ShareProfileQrButton displayName={displayName} handle={handle} />
            <Link
              href="/profile/settings"
              aria-label="Settings"
              className="flex items-center justify-center h-9 w-9 rounded-full bg-white/70 border border-black border-b-2 text-black hover:bg-white transition"
            >
              <FiSettings className="h-4 w-4" />
            </Link>
          </div>

          {/* Avatar + name */}
          <div className="mt-4 flex flex-col items-center gap-2 text-center">
            <Link
              href="/profile/edit"
              aria-label="Edit profile"
              className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full bg-white flex items-center justify-center overflow-hidden border-2 border-black border-b-4 shadow"
            >
              <Image
                src={DEFAULT_AVATAR}
                alt={displayName}
                width={120}
                height={120}
                className="object-contain"
                priority
              />
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
              {displayName}
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-black/70">
              {handle} · joined {joinedLabel}
            </p>
          </div>
        </header>

        {/* Stats row -------------------------------------------------- */}
        <section className="px-4 sm:px-6">
          <div className="flex items-stretch gap-3">
            <StatPill value={'0'} label="Following" />
            <span className="w-px bg-black/10" aria-hidden />
            <StatPill value={'0'} label="Followers" />
          </div>
        </section>

        {/* Friends CTA ------------------------------------------------ */}
        <section className="px-4 sm:px-6">
          <Link
            href="/profile/friends"
            className="flex items-center justify-center gap-2 w-full h-12 rounded-md bg-white text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide hover:bg-white/80 hover:-translate-y-0.5 transition"
          >
            <FiUserPlus className="h-4 w-4" />
            Add friends
          </Link>
        </section>


        <section className="px-4 sm:px-6 flex flex-col gap-3">
          <SectionHeader title="Summary" href="/profile/summary" />
          {/* Whole white card is the link target — the chevron in the header
              is just the visual cue. No interactive children inside, so a
              plain Link wrap is safe (no nested-anchor warnings). */}
          <Link
            href="/profile/summary"
            aria-label="See full summary"
            className="grid grid-cols-2 gap-3 rounded-2xl bg-white border border-black border-b-2 p-4 hover:-translate-y-0.5 transition"
          >
            <SummaryItem
              icon={hasActiveStreak ? '/icons/global/streak.png' : '/icons/global/streak_freeze.png'}
              value={`${totalStreak} days`}
              label="Streak"
            />
            <SummaryItem
              icon="/icons/global/coin.png"
              value={
                hideBalance
                  ? '••••'
                  : `$${activeDepositsTotalAmount.toFixed(2)} ${token?.symbol ?? ''}`.trim()
              }
              label="Active deposits"
            />
            <SummaryItem
              icon="/icons/global/coin.png"
              value={Math.floor(goldCoins).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              label="Gold"
            />
            <SummaryItem
              icon="/icons/global/star.png"
              value={`${Math.floor(experience).toLocaleString(undefined, { maximumFractionDigits: 0 })} XP`}
              label="Experience"
            />
          </Link>
        </section>

        {/* Achievements ---------------------------------------------- */}
        <section className="px-4 sm:px-6 flex flex-col gap-3">
          <SectionHeader
            title="Achievements"
            count={achievements.filter((b) => b.unlocked).length}
            href="/profile/achievements"
          />
          {/* The badge tiles are real <button>s, so we can't wrap the card in
              an <a> without invalid nesting. Instead, we place an absolute
              Link layer behind the grid (catches clicks on the padding and
              gaps), and have each tile's onPress push to the same route so
              clicking a badge image also takes the user to the trophy room
              — claiming happens there, not from the profile preview. */}
          <div className="relative rounded-2xl bg-white border border-black border-b-2 p-4">
            <Link
              href="/profile/achievements"
              aria-label="See all achievements"
              className="absolute inset-0 rounded-2xl z-0"
            />
            <div className="relative z-10 grid grid-cols-4 gap-2 sm:gap-4 place-items-center">
              {achievements.slice(0, 4).map((badge) => (
                <BadgeTile
                  key={badge.id}
                  badge={badge}
                  claimable={badge.unlocked && !isClaimed(badge.id)}
                  loading={rankLoading && ['first-place', 'second-place', 'third-place'].includes(badge.id)}
                  onPress={() => router.push('/profile/achievements')}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

    </div>
  );
}
