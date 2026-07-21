'use client';

import { buildServerAchievements, type Badge } from '@/core-ui/data/profile-badges';
import { deriveLevel } from '@/core-ui/helpers';
import {
  LeaderboardPageDTO,
  leaderboardQueryPrefix,
  useProfileAchievements,
  useProfileData,
  useProfileExperience,
  useProfileStreak,
} from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { InfiniteData, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowLeft, FiLoader } from 'react-icons/fi';
import { BadgeTile } from '../profile/BadgeTile';
import { LeaderboardBadgeModal } from './LeaderboardBadgeModal';
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
 * Identity header for another player's world page (`/leaderboard/[username]`,
 * already resolved to a wallet by the page).
 * Deliberately compact — a single banner row (back · avatar · username +
 * joined date · follow) plus the stat chips and the unlocked-achievements
 * strip — so the header and the world map fit one screen without scrolling.
 * The wallet itself is never surfaced.
 */
export function LeaderboardUserHeader({ walletAddress }: { walletAddress: string }) {
  const { t } = useTranslation();
  const { walletAddress: viewerWallet, network } = useConfigStore();
  const queryClient = useQueryClient();
  const { data: profile } = useProfileData(walletAddress);
  const { data: achievementsData, isLoading: achievementsLoading } =
    useProfileAchievements(walletAddress);
  const { data: experienceData } = useProfileExperience(walletAddress);
  const { data: streakData } = useProfileStreak(walletAddress);

  // Snapshot of this wallet's row from the already-cached leaderboard feed. The
  // user almost always lands here from the list, so nickname/avatar/XP/streak
  // are known before the per-wallet queries resolve — render those immediately
  // instead of placeholders, then let the fresh per-wallet data take over.
  // The feed is an infinite query (possibly several cached views: search/sort
  // variants), so scan every cached view's pages for the wallet.
  const listRow = useMemo(() => {
    const views = queryClient.getQueriesData<InfiniteData<LeaderboardPageDTO>>({
      queryKey: leaderboardQueryPrefix(network?.networkName),
    });
    for (const [, data] of views) {
      for (const page of data?.pages ?? []) {
        const row = page.rows.find((r) => r.walletAddress === walletAddress);
        if (row) return row;
      }
    }
    return undefined;
  }, [queryClient, network?.networkName, walletAddress]);

  const nickname = profile ? profile.nickname : listRow?.nickname;
  const avatarUrl = profile ? profile.avatarUrl : listRow?.avatarUrl;
  const username = getLeaderboardUsername(nickname, walletAddress);
  const { level } = deriveLevel(
    experienceData ? experienceData.experience : (listRow?.experience ?? 0),
  );
  const streak = streakData
    ? (streakData.yesterdayStreak || 0) + (streakData.todayStreak ? 1 : 0)
    : (listRow?.streak ?? 0);
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

  // Detalle read-only del logro clickeado. El hash del mint sale de la misma
  // respuesta de achievements de ESTE perfil (campo transactionHash).
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const selectedTxHash = useMemo(() => {
    if (!selectedBadge) return null;
    const row = achievementsData?.achievements?.find((a) => a.key === selectedBadge.id);
    return row?.minted && row.transactionHash ? row.transactionHash : null;
  }, [selectedBadge, achievementsData?.achievements]);

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
            {avatarUrl ? (
              // next/image fetches the (possibly http) MinIO URL server-side
              // and re-serves it over https, so the photo always renders.
              <Image
                src={avatarUrl}
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
              {/* While badges load, show the count the list already knows so the
                  number doesn't flash 0 → N. */}
              {achievementsData ? unlockedBadges.length : (listRow?.badges ?? 0)}
            </span>
          </div>
          {/* Fixed h-14 row in every state (loading / badges / empty) so the
              strip never resizes and the map below doesn't jump. The badges
              get a 48px lane at the top and the horizontal scrollbar gets its
              own lane underneath (pb-1 + overflow-y-hidden) — without it the
              bar paints over the medals and, by eating 4px of the row, spawns
              a phantom vertical scrollbar on the right. */}
          {achievementsLoading ? (
            <div className="flex h-14 items-center justify-center">
              <FiLoader className="h-4 w-4 animate-spin text-gray-400" aria-hidden />
            </div>
          ) : unlockedBadges.length > 0 ? (
            <div className="flex h-14 items-start gap-3 overflow-x-auto overflow-y-hidden pb-1 snap-x">
              {unlockedBadges.map((badge) => (
                <div key={badge.id} className="w-12 shrink-0 snap-start">
                  <BadgeTile badge={badge} size="sm" onPress={() => setSelectedBadge(badge)} />
                </div>
              ))}
            </div>
          ) : (
            <p className="flex h-14 items-center text-xs font-medium text-gray-500">
              {t('leaderboard.user.noAchievements', 'No achievements unlocked yet')}
            </p>
          )}
        </div>
      </div>

      <LeaderboardBadgeModal
        badge={selectedBadge}
        txHash={selectedTxHash}
        open={!!selectedBadge}
        onOpenChange={(open) => {
          if (!open) setSelectedBadge(null);
        }}
      />
    </div>
  );
}
