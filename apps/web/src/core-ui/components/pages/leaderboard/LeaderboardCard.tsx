'use client';

import type { AvatarConfig } from '@vaquita/avatar';
import Image from 'next/image';
import Link from 'next/link';
import { FiHeart, FiLoader } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useFollowingWallets, useLikedMapWallets, useToggleFollow, useToggleMapLike } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { VaquitaAvatarCircle } from '../../avatar/VaquitaAvatar';
import { MapMiniPreview } from './MapMiniPreview';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type LeaderboardCardData = {
  position: number;
  walletAddress: string;
  /** Raw nickname ('' when the profile never set one) — used to build the
   *  /leaderboard/<username> link. */
  nickname: string;
  /** Always the username (nickname or `vaqueroXXXX` fallback) — the wallet
   *  is never surfaced in the UI. */
  username: string;
  /** The user's character avatar. Resolved by the API, so it's always present
   *  — a profile that never opened the builder gets a wallet-seeded one. */
  avatarConfig?: AvatarConfig;
  level: number;
  streak: number;
  badges: number;
  /** Gold coins and XP — the same trio the home header shows (streak · coins · XP). */
  coins: number;
  experience: number;
  /** Hearts this profile's 3D world has collected — a real, persisted count. */
  mapLikes: number;
  /** Seed for the (still mocked) comment count. */
  commentsSeed: number;
  isCurrentUser: boolean;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Top-3 medals as art, not emoji: the emoji rendered differently on every
 *  platform and clashed with the rest of the game's icon set. */
const MEDALS: Record<number, string> = {
  1: '/icons/global/gold_medal.png',
  2: '/icons/global/silver_medal.png',
  3: '/icons/global/bronze_medal.png',
};

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

export function Avatar({
  username,
  avatarConfig,
  seed,
}: {
  username: string;
  avatarConfig?: AvatarConfig | undefined;
  seed?: string | undefined;
}) {
  // Inline SVG, so a 50-row leaderboard costs zero image requests.
  return <VaquitaAvatarCircle config={avatarConfig} seed={seed ?? username} alt={username} className="h-10 w-10" />;
}

export function PositionPill({
  position,
  /** Drop the pill and the "#N" for the top 3 and show the medal art on its
   *  own — it already carries the black outline the pill would add. Ranks
   *  without a medal still fall back to the "#N" pill. The rank always reaches
   *  screen readers through the label. */
  medalOnly = false,
}: {
  position: number;
  medalOnly?: boolean;
}) {
  const { t } = useTranslation();
  const medal = MEDALS[position];
  const label = t('leaderboard.card.positionLabel', 'Position {{position}}', { position });

  // The medal art is detailed, so it needs more room than the 16px of the other
  // inline icons or it collapses into a grey blob.
  if (medal && medalOnly) {
    return (
      <Image
        src={medal}
        alt={label}
        width={26}
        height={26}
        className="object-contain shrink-0"
      />
    );
  }

  return (
    // Always white: the top 3 used to get a primary fill, but the bronze medal
    // is nearly the same orange and vanished into it. The medal art carries the
    // rank colour now, so the pill just needs to stay readable over the map.
    <span
      className="inline-flex items-center gap-1 rounded-full border border-black border-b-2 bg-white px-2.5 py-0.5 text-xs font-extrabold tabular-nums text-black shrink-0"
      aria-label={label}
    >
      {medal && (
        <Image src={medal} alt="" width={20} height={20} className="object-contain shrink-0" />
      )}
      <span>#{position}</span>
    </span>
  );
}

/** Una card de stat: ícono + número, sin etiqueta. */
function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5"
      title={label}
    >
      <Image src={icon} alt={label} width={20} height={20} className="object-contain" />
      <span className="text-xs font-bold text-black tabular-nums">{value}</span>
    </div>
  );
}

/** Racha · monedas · XP, los mismos tres números (y los mismos íconos) que la
 *  barra de stats del home, para que el perfil ajeno se lea igual que el propio.
 *  Tres cards separadas, no una fila con divisores: cada dato es su propio bloque. */
function StatsRow({ streak, coins, experience }: { streak: number; coins: number; experience: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-stretch gap-2">
      <Stat
        icon="/icons/global/streak_face.png"
        value={`${streak}`}
        label={t('leaderboard.card.dayStreak', 'Day streak')}
      />
      <Stat
        icon="/icons/global/coin.png"
        value={`${Math.floor(coins).toLocaleString()}`}
        label={t('leaderboard.card.coins', 'Coins')}
      />
      <Stat
        icon="/icons/global/star.png"
        value={`${Math.floor(experience).toLocaleString()}`}
        label={t('leaderboard.card.experience', 'XP')}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Social row — real hearts, mocked comments                           */
/* ------------------------------------------------------------------ */

interface SocialRowProps {
  /** Owner of the map being hearted. */
  walletAddress: string;
  likes: number;
}

/**
 * The heart is persisted: `useLikedMapWallets` seeds the filled state for every
 * row from one request, and the toggle optimistically patches that set plus the
 * owner's count. Comments are hidden for now — the feature isn't built yet, so
 * the placeholder button was removed rather than shipping a dead affordance.
 */
function SocialRow({ walletAddress, likes }: SocialRowProps) {
  const { t } = useTranslation();
  const { walletAddress: viewerWallet } = useConfigStore();
  const { data: likedWallets } = useLikedMapWallets();
  const toggleLike = useToggleMapLike();

  const liked = likedWallets?.has(walletAddress.toLowerCase()) ?? false;
  // Liking your own map is rejected server-side, so don't offer it.
  const isOwnMap = !!viewerWallet && viewerWallet.toLowerCase() === walletAddress.toLowerCase();

  const handleLike = (e: React.MouseEvent) => {
    // The button lives inside an anchor, so we stop propagation to keep its
    // click from triggering the card-level navigation.
    e.preventDefault();
    e.stopPropagation();
    if (isOwnMap || !viewerWallet) return;
    toggleLike.mutate({ targetWallet: walletAddress, isLiked: liked });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={handleLike}
        disabled={isOwnMap || !viewerWallet}
        aria-pressed={liked}
        aria-label={liked ? t('leaderboard.card.unlike', 'Unlike') : t('leaderboard.card.like', 'Like')}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-black/5 transition bg-transparent disabled:hover:bg-transparent"
      >
        <FiHeart
          className={`h-4 w-4 transition ${liked ? 'fill-red-500 text-red-500' : 'text-black'}`}
        />
        <span className="text-xs font-bold text-black tabular-nums">{likes}</span>
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
      className={`inline-flex items-center gap-1 rounded-full border border-black border-b-2 px-2.5 py-1 text-[10px] font-bold shrink-0 transition ${
        pending ? 'opacity-70 cursor-wait' : 'hover:-translate-y-0.5'
      } ${
        following
          ? 'bg-white text-black hover:bg-white/80'
          : 'bg-primary text-black hover:bg-primary/80'
      }`}
    >
      {/* Sin ícono: el texto ya dice qué hace el botón, y el check/persona sólo
          competían con él en un botón de 10px. El spinner sí queda: es estado. */}
      {pending && <FiLoader className="h-3 w-3 animate-spin" aria-hidden />}
      <span>
        {following
          ? t('leaderboard.card.unfollow', 'Unfollow')
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
      <Avatar username={user.username} avatarConfig={user.avatarConfig} seed={user.walletAddress} />

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
export function LeaderboardCard({
  user,
  /** Drops the rank pill from the preview. The explore feed is unranked — it has
   *  no positions to show, and a "#42" there would imply an order that isn't
   *  there (its rows come back shuffled). */
  showPosition = true,
}: {
  user: LeaderboardCardData;
  showPosition?: boolean;
}) {
  const { t } = useTranslation();
  // Current-user card is filled with a soft primary tint (not just an outline)
  // so "this is you" reads at a glance while scrolling the feed.
  const containerClasses = user.isCurrentUser
    ? 'border-2 border-primary bg-primary/20'
    : 'border border-black/10 bg-white';

  return (
    <Link
      // Public URLs are keyed by username; the wallet is only a fallback for
      // profiles that never set one (the page accepts both).
      href={`/explore/${encodeURIComponent(user.nickname || user.walletAddress)}`}
      aria-label={t('leaderboard.card.viewWorld', "View {{username}}'s world", {
        username: user.username,
      })}
      className={`group flex flex-col gap-2.5 rounded-xl p-3 shadow-sm transition hover:-translate-y-0.5 ${containerClasses}`}
    >
      <CardHeader user={user} />

      <MapMiniPreview
        walletAddress={user.walletAddress}
        caption={t('leaderboard.card.levelShort', 'Lv {{level}}', { level: user.level })}
        badge={showPosition ? <PositionPill position={user.position} /> : undefined}
      />

      <StatsRow streak={user.streak} coins={user.coins} experience={user.experience} />

      <SocialRow walletAddress={user.walletAddress} likes={user.mapLikes} />
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
      className="flex flex-col gap-2.5 rounded-xl border border-black/10 bg-white p-3 animate-pulse"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-black/10" />
        <div className="flex-1 h-3 w-32 rounded bg-black/10" />
        <div className="h-6 w-16 rounded-full bg-black/10" />
      </div>
      <div className="w-full aspect-[16/9] rounded-lg bg-black/10" />
      {/* Tres cards de stats: racha · monedas · XP, la misma altura que las reales. */}
      <div className="flex gap-2">
        <div className="h-8 flex-1 rounded-lg bg-black/5" />
        <div className="h-8 flex-1 rounded-lg bg-black/5" />
        <div className="h-8 flex-1 rounded-lg bg-black/5" />
      </div>
      {/* Solo el corazón: los comentarios se ocultaron, así que el skeleton ya
          no reserva un segundo pill para ellos. Alineado a la derecha, igual
          que el corazón real de la card. */}
      <div className="flex justify-end gap-2">
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
