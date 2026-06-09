'use client';

import { buildServerAchievements } from '@/core-ui/data/profile-badges';
import { deriveLevel } from '@/core-ui/helpers';
import {
  useProfileAchievements,
  useProfileData,
  useProfileExperience,
  useProfileStreak,
} from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import Image from 'next/image';
import { ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeTile } from '../profile/BadgeTile';
import { Avatar, FollowButton, getLeaderboardUsername } from './LeaderboardCard';

/** Slim stat chip mirroring the leaderboard card's StatBox. */
function StatChip({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-1.5">
      <span className="flex items-center justify-center w-5 h-5 shrink-0">{icon}</span>
      <div className="flex flex-col items-start leading-tight">
        <span className="text-sm font-extrabold text-black tabular-nums leading-none">{value}</span>
        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500">
          {label}
        </span>
      </div>
    </div>
  );
}

/**
 * Identity header for another player's world page (`/leaderboard/[wallet]`).
 * Replaces the old raw-wallet banner: shows the username + avatar, level,
 * streak, a follow button, and a horizontal carousel of the achievements the
 * player has unlocked. The wallet itself is never surfaced.
 */
export function LeaderboardUserHeader({ walletAddress }: { walletAddress: string }) {
  const { t } = useTranslation();
  const { walletAddress: viewerWallet } = useConfigStore();
  const { data: profile } = useProfileData(walletAddress);
  const { data: achievementsData } = useProfileAchievements(walletAddress);
  const { data: experienceData } = useProfileExperience(walletAddress);
  const { data: streakData } = useProfileStreak(walletAddress);

  const username = getLeaderboardUsername(profile?.nickname, walletAddress);
  const { level } = deriveLevel(experienceData?.experience ?? 0);
  const streak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const isOwnProfile = viewerWallet?.toLowerCase() === walletAddress.toLowerCase();

  // Server `unlocked` is the source of truth here — the viewer has no access
  // to this wallet's client-side signals (deposits, savings, rank).
  const unlockedBadges = useMemo(
    () => buildServerAchievements(achievementsData?.achievements).filter((b) => b.unlocked),
    [achievementsData?.achievements],
  );

  return (
    <div className="w-full max-w-xl mx-auto px-4 pt-3 flex flex-col gap-2.5">
      {/* Identity row ------------------------------------------------- */}
      <div className="flex items-center gap-2">
        <Avatar username={username} avatarUrl={profile?.avatarUrl} />
        <p className="flex-1 min-w-0 text-sm font-extrabold text-black truncate">{username}</p>
        {!isOwnProfile && <FollowButton username={username} targetWallet={walletAddress} />}
      </div>

      {/* Stats row ---------------------------------------------------- */}
      <div className="flex gap-2">
        <StatChip
          icon={
            <Image
              src="/icons/global/star.png"
              alt=""
              width={20}
              height={20}
              className="object-contain"
            />
          }
          value={t('leaderboard.card.levelShort', 'Lv {{level}}', { level })}
          label={t('profilePages.profile.experience', 'Experience')}
        />
        <StatChip
          icon={
            <Image
              src="/icons/global/streak_face.png"
              alt=""
              width={20}
              height={20}
              className="object-contain"
            />
          }
          value={`${streak}`}
          label={t('leaderboard.card.dayStreak', 'Day streak')}
        />
      </div>

      {/* Achievements carousel ----------------------------------------- */}
      <div className="rounded-2xl bg-white border border-black border-b-2 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-600">
            {t('profilePages.profile.achievements', 'Achievements')}
          </h2>
          <span className="text-xs font-extrabold text-black tabular-nums">
            {unlockedBadges.length}
          </span>
        </div>
        {unlockedBadges.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
            {unlockedBadges.map((badge) => (
              <div key={badge.id} className="w-16 shrink-0">
                <BadgeTile badge={badge} size="sm" onPress={() => {}} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs font-medium text-gray-500 py-1">
            {t('leaderboard.user.noAchievements', 'No achievements unlocked yet')}
          </p>
        )}
      </div>
    </div>
  );
}
