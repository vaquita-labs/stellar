'use client';

import Image from 'next/image';
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
}

/**
 * Renders an achievement as the medal artwork itself — no circular frame.
 * A soft, blurred accent halo sits behind the image for depth so the badge
 * still feels gamified without containing the art in a disk.
 */
export function BadgeTile({ badge, onPress, size = 'md', showTitle = false }: BadgeTileProps) {
  const s = SIZES[size];
  return (
    <button
      type="button"
      onClick={onPress}
      className="group flex flex-col items-center gap-1.5 bg-transparent focus:outline-none w-full"
    >
      <span
        className={`relative flex aspect-square w-full ${s.wrap} items-center justify-center transition group-hover:-translate-y-0.5 ${
          badge.unlocked ? '' : 'grayscale opacity-60'
        }`}
      >
        {/* Soft accent halo — gives depth without a hard frame. */}
        <span
          aria-hidden
          className={`absolute ${s.glowInset} rounded-full blur-2xl opacity-50`}
          style={{ background: badge.accent ?? '#F5A161' }}
        />
        <Image
          src={badge.icon}
          alt={badge.title}
          width={s.img.w}
          height={s.img.h}
          className="relative h-full w-full object-contain drop-shadow-md"
        />
      </span>
      {showTitle && (
        <span className="text-[11px] sm:text-xs font-bold text-black text-center leading-tight mt-1 line-clamp-2">
          {badge.title}
        </span>
      )}
    </button>
  );
}
