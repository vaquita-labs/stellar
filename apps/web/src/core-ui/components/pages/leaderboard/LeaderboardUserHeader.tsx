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
import Link from 'next/link';
import { ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowLeft } from 'react-icons/fi';
import { BadgeTile } from '../profile/BadgeTile';
import { FollowButton, getLeaderboardUsername } from './LeaderboardCard';

const DEFAULT_AVATAR = '/vaquita/vaquita_isotipo.svg';

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
 * Deliberately compact — a single banner row (back · avatar · username +
 * joined date · follow) plus the stat chips and the unlocked-achievements
 * strip — so the header and the world map fit one screen without scrolling.
 * The wallet itself is never surfaced.
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

  const joinedLabel = useMemo(() => {
    const createdAt = profile?.createdAt;
    if (!createdAt) return '';
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }, [profile?.createdAt]);

  // Server `unlocked` is the source of truth here — the viewer has no access
  // to this wallet's client-side signals (deposits, savings, rank).
  const unlockedBadges = useMemo(
    () => buildServerAchievements(achievementsData?.achievements).filter((b) => b.unlocked),
    [achievementsData?.achievements],
  );

  return (
    <div className="w-full shrink-0 flex flex-col gap-2 pb-2">
      {/* Banner row — back · avatar · identity · follow ----------------- */}
      <header className="bg-primary px-3 sm:px-6 py-3 rounded-b-3xl border-b-2 border-black/10">
        <div className="flex items-center gap-2.5">
          <Link
            href="/leaderboard"
            aria-label={t('common.back', 'Back')}
            className="flex items-center justify-center h-9 w-9 shrink-0 rounded-full bg-white/70 border border-black border-b-2 text-black hover:bg-white transition"
          >
            <FiArrowLeft className="h-4 w-4" />
          </Link>

          <div className="relative h-14 w-14 shrink-0 rounded-full bg-white flex items-center justify-center overflow-hidden border-2 border-black border-b-4 shadow">
            {profile?.avatarUrl ? (
              // next/image fetches the (possibly http) MinIO URL server-side
              // and re-serves it over https, so the photo always renders.
              <Image
                src={profile.avatarUrl}
                alt={username}
                fill
                sizes="56px"
                className="object-cover"
                priority
              />
            ) : (
              <Image
                src={DEFAULT_AVATAR}
                alt={username}
                width={48}
                height={48}
                className="object-contain"
                priority
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold text-black tracking-tight truncate">
              {username}
            </p>
            {joinedLabel && (
              <p className="text-[11px] font-semibold text-black/70 truncate">
                {t('leaderboard.user.joined', 'Joined {{joinedLabel}}', { joinedLabel })}
              </p>
            )}
          </div>

          {!isOwnProfile && <FollowButton username={username} targetWallet={walletAddress} />}
        </div>
      </header>

      <div className="w-full max-w-xl mx-auto px-3 sm:px-4 flex flex-col gap-2">
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

        {/* Achievements strip -------------------------------------------- */}
        <div className="rounded-2xl bg-white border border-black border-b-2 px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-600">
              {t('profilePages.profile.achievements', 'Achievements')}
            </h2>
            <span className="text-xs font-extrabold text-black tabular-nums">
              {unlockedBadges.length}
            </span>
          </div>
          {unlockedBadges.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto">
              {unlockedBadges.map((badge) => (
                <div key={badge.id} className="w-12 shrink-0">
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
    </div>
  );
}
