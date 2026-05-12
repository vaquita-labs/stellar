'use client';

import Image from 'next/image';
import type { Badge } from '../../../data/profile-badges';

type BadgeSize = 'sm' | 'md' | 'lg';

const SIZES: Record<
  BadgeSize,
  { wrap: string; img: { w: number; h: number; cls: string }; chip: string }
> = {
  sm: {
    wrap: 'max-w-[64px] sm:max-w-[72px]',
    img: { w: 80, h: 80, cls: 'w-[60%] h-[60%]' },
    chip: 'text-[10px]',
  },
  md: {
    wrap: 'max-w-[80px] sm:max-w-[96px]',
    img: { w: 96, h: 96, cls: 'w-[60%] h-[60%]' },
    chip: 'text-[11px]',
  },
  lg: {
    wrap: 'max-w-[120px] sm:max-w-[140px]',
    img: { w: 140, h: 140, cls: 'w-[62%] h-[62%]' },
    chip: 'text-xs',
  },
};

interface BadgeTileProps {
  badge: Badge;
  onPress: () => void;
  size?: BadgeSize;
  /** Show the badge title under the tile (used in the trophy room). */
  showTitle?: boolean;
}

export function BadgeTile({ badge, onPress, size = 'md', showTitle = false }: BadgeTileProps) {
  const s = SIZES[size];
  return (
    <button
      type="button"
      onClick={onPress}
      className="group flex flex-col items-center gap-1.5 bg-transparent focus:outline-none w-full"
    >
      <span
        className={`flex aspect-square w-full ${s.wrap} items-center justify-center rounded-full border-2 border-black border-b-4 shadow transition group-hover:-translate-y-0.5 ${
          badge.unlocked ? '' : 'grayscale opacity-60'
        }`}
        style={{ background: badge.accent ?? '#F5A161' }}
      >
        <Image
          src={badge.icon}
          alt={badge.title}
          width={s.img.w}
          height={s.img.h}
          className={`${s.img.cls} object-contain drop-shadow`}
        />
      </span>
      {badge.progress && (
        <span
          className={`${s.chip} font-bold text-black bg-white border border-black rounded-full px-2 py-0.5 -mt-3 z-[1] tabular-nums`}
        >
          {badge.progress.target.toLocaleString()}
        </span>
      )}
      {showTitle && (
        <span className="text-[11px] sm:text-xs font-bold text-black text-center leading-tight mt-1 line-clamp-2">
          {badge.title}
        </span>
      )}
    </button>
  );
}
