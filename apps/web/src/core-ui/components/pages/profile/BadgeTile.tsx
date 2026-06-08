'use client';

import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import type { Badge } from '../../../data/profile-badges';

type BadgeSize = 'sm' | 'md' | 'lg';

const SIZES: Record<
  BadgeSize,
  { wrap: string; img: { w: number; h: number }; glowInset: string }
> = {
  sm: {
    wrap: 'max-w-[72px] sm:max-w-[80px]',
    img: { w: 128, h: 128 },
    glowInset: 'inset-2',
  },
  md: {
    wrap: 'max-w-[88px] sm:max-w-[104px]',
    img: { w: 160, h: 160 },
    glowInset: 'inset-2',
  },
  lg: {
    wrap: 'max-w-[140px] sm:max-w-[160px]',
    img: { w: 240, h: 240 },
    glowInset: 'inset-3',
  },
};

interface BadgeTileProps {
  badge: Badge;
  onPress: () => void;
  size?: BadgeSize;
  /** Show the badge title under the tile (used in the trophy room). */
  showTitle?: boolean;
  /** Unlocked but not yet claimed — keep the image grayscale (it isn't truly
   *  "earned" until the reward is collected) and pulse a brighter halo to
   *  draw the eye to it. Effectively the "next action" affordance. */
  claimable?: boolean;
  /** Rank query in flight — dim tile and pulse to signal pending state. */
  loading?: boolean;
}

/**
 * Renders an achievement as the medal artwork itself — no circular frame.
 * A soft, blurred accent halo sits behind the image for depth so the badge
 * still feels gamified without containing the art in a disk.
 *
 * Tri-state visual:
 *  - locked     → grayscale image + dim halo
 *  - claimable  → grayscale image + bright pulsing halo (call to action)
 *  - claimed    → full color image + dim halo
 */
export function BadgeTile({
  badge,
  onPress,
  size = 'md',
  showTitle = false,
  claimable = false,
  loading = false,
}: BadgeTileProps) {
  const { t } = useTranslation();
  const s = SIZES[size];
  // Badge copy comes from a backend-served catalog; localize known built-in
  // badges by id, falling back to the English title supplied with the data.
  const title = t(`achievements.items.${badge.id}.title`, badge.title);
  // An achievement only "lights up" once it's been claimed — until then the
  // image stays gray so the pulsing halo + tinted background read as the
  // active "click me" affordance.
  const fullyEarned = badge.unlocked && !claimable;
  // Locked badges desaturate the entire wrap (image + halo together) so the
  // tile reads as inert. Claimable badges keep the wrap colorful and pull
  // the grayscale onto the image only — the colored background can then
  // do its job of catching the eye.
  const wrapFilter = !badge.unlocked ? 'grayscale opacity-60' : '';
  return (
    <button
      type="button"
      onClick={onPress}
      className={`group flex flex-col items-center gap-1.5 bg-transparent focus:outline-none w-full cursor-pointer ${loading ? 'opacity-50 animate-pulse pointer-events-none' : ''}`}
    >
      <span
        className={`relative flex aspect-square w-full ${s.wrap} items-center justify-center transition group-hover:-translate-y-0.5 ${wrapFilter}`}
      >
        {/* Claimable cue: a soft tinted disc behind the medal, gently pulsing
            so the user spots "this one is ready to grab". Circular (and lightly
            blurred) on purpose — the medallions are round, so a rounded-square
            panel made the tile look boxy. `animate-pulse` runs a slow 2s
            opacity dip, drawing the eye without flashing. */}
        {claimable && (
          <span
            aria-hidden
            className="absolute inset-1 rounded-full blur-md animate-pulse"
            style={{ background: badge.accent ?? '#F5A161', opacity: 0.45 }}
          />
        )}
        {/* Soft accent halo — gives depth without a hard frame. Brighter +
            pulsing when the badge is ready to claim, otherwise a subtle glow. */}
        <span
          aria-hidden
          className={`absolute ${s.glowInset} rounded-full blur-2xl ${
            claimable ? 'opacity-90 animate-pulse' : 'opacity-50'
          }`}
          style={{ background: badge.accent ?? '#F5A161' }}
        />
        <Image
          src={badge.icon}
          alt={title}
          width={s.img.w}
          height={s.img.h}
          className={`relative h-full w-full object-contain drop-shadow-md ${
            fullyEarned ? '' : 'grayscale opacity-70'
          }`}
        />
      </span>
      {showTitle && (
        <span className="text-[11px] sm:text-xs font-bold text-black text-center leading-tight mt-1 line-clamp-2">
          {title}
        </span>
      )}
    </button>
  );
}
