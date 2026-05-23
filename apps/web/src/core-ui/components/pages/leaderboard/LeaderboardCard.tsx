'use client';

import { toast } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, useState } from 'react';
import { FiHeart, FiMessageCircle } from 'react-icons/fi';
import { WorldPreviewTile } from './WorldPreviewTile';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type LeaderboardCardData = {
  position: number;
  walletAddress: string;
  /** Always the username (nickname or `vaqueroXXXX` fallback) — the wallet
   *  is never surfaced in the UI. */
  username: string;
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

const AVATAR_PALETTES = [
  'bg-[#FFE7C7] text-[#7A3E00]',
  'bg-[#DDF4FF] text-[#0A4A6E]',
  'bg-[#E6F8D9] text-[#2E5A1B]',
  'bg-[#F6E0FF] text-[#4A2E70]',
  'bg-[#FFF6C2] text-[#7A5A00]',
  'bg-[#FFD7D7] text-[#7A1A1A]',
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Two-letter initials for the username (drops the `@` prefix). */
function initialsOf(username: string): string {
  const clean = username.replace(/^@/, '').trim();
  if (!clean) return 'VQ';
  const words = clean.split(/[\s_-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Avatar({ username }: { username: string }) {
  const palette = AVATAR_PALETTES[hashString(username) % AVATAR_PALETTES.length];
  return (
    <div
      className={`h-10 w-10 shrink-0 rounded-full border border-black/15 flex items-center justify-center text-sm font-extrabold ${palette}`}
    >
      {initialsOf(username)}
    </div>
  );
}

function PositionPill({ position }: { position: number }) {
  const medal = MEDALS[position];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-black border-b-2 px-2.5 py-0.5 text-xs font-extrabold tabular-nums shrink-0 ${
        position <= 3 ? 'bg-primary text-black' : 'bg-white text-black'
      }`}
      aria-label={`Position ${position}`}
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
    toast.success(`Comments on ${username}'s world coming soon`);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleLike}
        aria-pressed={liked}
        aria-label={liked ? 'Unlike' : 'Like'}
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
        aria-label="Open comments"
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-black/5 transition bg-transparent"
      >
        <FiMessageCircle className="h-4 w-4 text-black" />
        <span className="text-xs font-bold text-black tabular-nums">{comments}</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card header                                                         */
/* ------------------------------------------------------------------ */

function CardHeader({ user }: { user: LeaderboardCardData }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar username={user.username} />

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <p className="text-sm font-extrabold text-black truncate">{user.username}</p>
        {user.isCurrentUser && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-black text-white rounded-sm px-1.5 py-0.5 shrink-0">
            You
          </span>
        )}
      </div>

      <PositionPill position={user.position} />
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
  // Current-user card is filled with a soft primary tint (not just an outline)
  // so "this is you" reads at a glance while scrolling the feed.
  const containerClasses = user.isCurrentUser
    ? 'border-2 border-primary bg-primary/20'
    : 'border border-black/10 bg-white';

  return (
    <Link
      href={`/leaderboard/${user.walletAddress}`}
      aria-label={`View ${user.username}'s world`}
      className={`group flex flex-col gap-2.5 rounded-3xl p-3 shadow-sm transition hover:-translate-y-0.5 ${containerClasses}`}
    >
      <CardHeader user={user} />

      <WorldPreviewTile caption={`Lv ${user.level}`} />

      <div className="flex gap-2">
        <StatBox
          icon={
            <Image
              src="/icons/global/streak.png"
              alt=""
              width={24}
              height={24}
              className="object-contain"
            />
          }
          value={`${user.streak}`}
          label="Day streak"
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
          label="Badges"
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
