'use client';

import { toast } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, useState } from 'react';
import { FiCheck, FiHeart, FiLoader, FiMessageCircle, FiUserPlus } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useFollowingWallets, useToggleFollow } from '../../../hooks';
import { MapMiniPreview } from './MapMiniPreview';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type LeaderboardCardData = {
  position: number;
  walletAddress: string;
  /** Always the username (nickname or `vaqueroXXXX` fallback) — the wallet
   *  is never surfaced in the UI. */
  username: string;
  /** Uploaded profile photo URL, or '' to fall back to the default vaquita avatar. */
  avatarUrl?: string;
  level: number;
  streak: number;
  badges: number;
  /** Seed for the (mocked) like + comment counts. */
  likesSeed: number;
  commentsSeed: number;
  isCurrentUser: boolean;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const DEFAULT_AVATAR = '/vaquita/vaquita_isotipo.svg';

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

export function Avatar({ username, avatarUrl }: { username: string; avatarUrl?: string }) {
  if (avatarUrl) {
    // next/image fetches the (possibly http) MinIO URL server-side and re-serves
    // it over https, so the photo renders without a mixed-content block.
    return (
      <div className="relative h-10 w-10 shrink-0 rounded-full border border-black/15 overflow-hidden">
        <Image src={avatarUrl} alt={username} fill sizes="40px" className="object-cover" />
      </div>
    );
  }
  return (
    <div className="h-10 w-10 shrink-0 rounded-full border border-black/15 bg-white flex items-center justify-center overflow-hidden">
      <Image
        src={DEFAULT_AVATAR}
        alt={username}
        width={32}
        height={32}
        className="object-contain"
      />
    </div>
  );
}

function PositionPill({ position }: { position: number }) {
  const { t } = useTranslation();
  const medal = MEDALS[position];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-black border-b-2 px-2.5 py-0.5 text-xs font-extrabold tabular-nums shrink-0 ${
        position <= 3 ? 'bg-primary text-black' : 'bg-white text-black'
      }`}
      aria-label={t('leaderboard.card.positionLabel', 'Position {{position}}', { position })}
    >
      {medal && <span aria-hidden className="text-sm leading-none">{medal}</span>}
      <span>#{position}</span>
    </span>
  );
}

/** Slim stat box, mirrors the Focus Tree "FOCUS TIME / GARDENERS" pattern.
 *  Accepts any icon node so callers can pass an emoji span or an <Image />. */
function StatBox({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2">
      <span className="flex items-center justify-center w-6 h-6 shrink-0">
        {icon}
      </span>
      <div className="flex flex-col items-start leading-tight">
        <span className="text-base font-extrabold text-black tabular-nums leading-none">
          {value}
        </span>
        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500">
          {label}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Social row — heart + comment (mocked client-side state)             */
/* ------------------------------------------------------------------ */

interface SocialRowProps {
  username: string;
  likes: number;
  comments: number;
}

function SocialRow({ username, likes, comments }: SocialRowProps) {
  const { t } = useTranslation();
  const [liked, setLiked] = useState(false);
  const likeCount = liked ? likes + 1 : likes;

  // Buttons live inside an anchor, so we stop propagation to keep their
  // clicks from triggering the card-level navigation.
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleLike = (e: React.MouseEvent) => {
    stop(e);
    setLiked((v) => !v);
  };

  const handleComment = (e: React.MouseEvent) => {
    stop(e);
    toast.success(
      t('leaderboard.card.commentsComingSoon', "Comments on {{username}}'s world coming soon", {
        username,
      })
    );
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleLike}
        aria-pressed={liked}
        aria-label={liked ? t('leaderboard.card.unlike', 'Unlike') : t('leaderboard.card.like', 'Like')}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-black/5 transition bg-transparent"
      >
        <FiHeart
          className={`h-4 w-4 transition ${liked ? 'fill-red-500 text-red-500' : 'text-black'}`}
        />
        <span className="text-xs font-bold text-black tabular-nums">{likeCount}</span>
      </button>
      <button
        type="button"
        onClick={handleComment}
        aria-label={t('leaderboard.card.openComments', 'Open comments')}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-black/5 transition bg-transparent"
      >
        <FiMessageCircle className="h-4 w-4 text-black" />
        <span className="text-xs font-bold text-black tabular-nums">{comments}</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Follow button — optimistic, persists via the /follows API           */
/* ------------------------------------------------------------------ */

/** Compact follow toggle for a card header. Lives inside the card's anchor,
 *  so it stops propagation to avoid triggering the card-level navigation. The
 *  initial state is seeded from the viewer's following-wallets set (so it's
 *  correct on first paint and survives a reload); the toggle mutation patches
 *  that cache optimistically and reconciles on settle. */
export function FollowButton({ username, targetWallet }: { username: string; targetWallet: string }) {
  const { t } = useTranslation();
  const toggleFollow = useToggleFollow();
  const { data: followingSet } = useFollowingWallets();
  const following = followingSet?.has(targetWallet.toLowerCase()) ?? false;
  const pending = toggleFollow.isPending;

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    toggleFollow.mutate({ targetWallet, isFollowing: following });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-busy={pending}
      aria-pressed={following}
      aria-label={
        following
          ? t('leaderboard.card.unfollowAria', 'Unfollow {{username}}', { username })
          : t('leaderboard.card.followAria', 'Follow {{username}}', { username })
      }
      className={`inline-flex items-center gap-1 rounded-full border border-black border-b-2 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider shrink-0 transition ${
        pending ? 'opacity-70 cursor-wait' : 'hover:-translate-y-0.5'
      } ${
        following
          ? 'bg-white text-black hover:bg-white/80'
          : 'bg-primary text-black hover:bg-primary/80'
      }`}
    >
      {pending ? (
        <FiLoader className="h-3 w-3 animate-spin" aria-hidden />
      ) : following ? (
        <FiCheck className="h-3 w-3" aria-hidden />
      ) : (
        <FiUserPlus className="h-3 w-3" aria-hidden />
      )}
      <span>
        {following
          ? t('leaderboard.card.following', 'Following')
          : t('leaderboard.card.follow', 'Follow')}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Card header                                                         */
/* ------------------------------------------------------------------ */

function CardHeader({ user }: { user: LeaderboardCardData }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <Avatar username={user.username} avatarUrl={user.avatarUrl} />

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <p className="text-sm font-extrabold text-black truncate">{user.username}</p>
        {user.isCurrentUser && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-black text-white rounded-sm px-1.5 py-0.5 shrink-0">
            {t('leaderboard.card.you', 'You')}
          </span>
        )}
      </div>

      {!user.isCurrentUser && (
        <FollowButton username={user.username} targetWallet={user.walletAddress} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

/**
 * One row in the leaderboard feed. Tighter than the Focus Tree reference
 * card so a couple fit per phone screen; preview tile is a clean dotted
 * square — no gradient, no random imagery.
 */
export function LeaderboardCard({ user }: { user: LeaderboardCardData }) {
  const { t } = useTranslation();
  // Current-user card is filled with a soft primary tint (not just an outline)
  // so "this is you" reads at a glance while scrolling the feed.
  const containerClasses = user.isCurrentUser
    ? 'border-2 border-primary bg-primary/20'
    : 'border border-black/10 bg-white';

  return (
    <Link
      href={`/leaderboard/${user.walletAddress}`}
      aria-label={t('leaderboard.card.viewWorld', "View {{username}}'s world", {
        username: user.username,
      })}
      className={`group flex flex-col gap-2.5 rounded-3xl p-3 shadow-sm transition hover:-translate-y-0.5 ${containerClasses}`}
    >
      <CardHeader user={user} />

      <MapMiniPreview
        walletAddress={user.walletAddress}
        caption={t('leaderboard.card.levelShort', 'Lv {{level}}', { level: user.level })}
        badge={<PositionPill position={user.position} />}
      />

      <div className="flex gap-2">
        <StatBox
          icon={
            <Image
              src="/icons/global/streak_face.png"
              alt=""
              width={24}
              height={24}
              className="object-contain"
            />
          }
          value={`${user.streak}`}
          label={t('leaderboard.card.dayStreak', 'Day streak')}
        />
        <StatBox
          icon={
            <Image
              src="/icons/global/trophy.png"
              alt=""
              width={24}
              height={24}
              className="object-contain"
            />
          }
          value={`${user.badges}`}
          label={t('leaderboard.card.badges', 'Badges')}
        />
      </div>

      <SocialRow
        username={user.username}
        likes={user.likesSeed}
        comments={user.commentsSeed}
      />
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

/** Loading placeholder mirroring the card's four-section shape. */
export function LeaderboardCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-2.5 rounded-3xl border border-black/10 bg-white p-3 animate-pulse"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-black/10" />
        <div className="flex-1 h-3 w-32 rounded bg-black/10" />
        <div className="h-6 w-14 rounded-full bg-black/10" />
      </div>
      <div className="w-full aspect-[16/9] rounded-2xl bg-black/10" />
      <div className="flex gap-2">
        <div className="h-10 flex-1 rounded-xl bg-black/5" />
        <div className="h-10 flex-1 rounded-xl bg-black/5" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-14 rounded-full bg-black/5" />
        <div className="h-6 w-14 rounded-full bg-black/5" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Username util — used by the page when building rows                 */
/* ------------------------------------------------------------------ */

/**
 * Resolve a stable, friendly username for any wallet. Never exposes the
 * wallet itself — falls back to `@vaqueroXXXX` (last-4 of address) when
 * the user hasn't picked a nickname yet.
 */
export const getLeaderboardUsername = (
  nickname: string | null | undefined,
  walletAddress: string
): string => {
  const trimmed = (nickname ?? '').trim();
  if (trimmed) {
    return trimmed.startsWith('@') ? trimmed : `@${trimmed.replace(/\s+/g, '')}`;
  }
  const tail = (walletAddress || '').slice(-4).toLowerCase();
  return tail ? `@vaquero${tail}` : '@vaquero';
};
