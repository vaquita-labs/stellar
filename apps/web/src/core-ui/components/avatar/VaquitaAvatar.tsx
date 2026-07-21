'use client';

import {
  AVATAR_VIEWBOX,
  composeAvatarSvg,
  resolveAvatarConfig,
  type AvatarConfig,
} from '@vaquita/avatar';
import React, { useId, useMemo } from 'react';

export type AvatarCrop = keyof typeof AVATAR_VIEWBOX;

interface VaquitaAvatarProps {
  /** The profile's stored config. Anything falsy renders the wallet-seeded avatar. */
  config?: AvatarConfig | null | undefined;
  /** Seed for the fallback avatar — pass the wallet address (or nickname). */
  seed?: string;
  /** How much of the character is visible. */
  crop?: AvatarCrop;
  /** Paint the config's background color behind the character. */
  background?: boolean;
  className?: string;
  /** Screen-reader label. Decorative by default (the name is always next to it). */
  alt?: string;
}

/**
 * Renders a character avatar as inline SVG.
 *
 * Inline (not <img src="data:...">) so the art scales crisply, inherits CSS
 * sizing, and costs zero network requests — a leaderboard page renders 50 of
 * these with no image loading at all. The markup is generated from a fixed
 * catalog of shapes and hex colors (see @vaquita/avatar), never from user
 * strings, so `dangerouslySetInnerHTML` here cannot carry user input: the
 * config is normalized to known ids before a single shape is drawn.
 */
export function VaquitaAvatar({
  config,
  seed = '',
  crop = 'full',
  background = true,
  className,
  alt,
}: VaquitaAvatarProps) {
  // Several avatars on one page would otherwise share a clipPath id and all
  // inherit the first one's hair clipping.
  const uid = useId().replace(/:/g, '');

  const svg = useMemo(
    () =>
      composeAvatarSvg(resolveAvatarConfig(config, seed), {
        viewBox: AVATAR_VIEWBOX[crop],
        background,
        idSuffix: uid,
      }),
    [config, seed, crop, background, uid]
  );

  return (
    <span
      className={className}
      role={alt ? 'img' : 'presentation'}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
      // eslint-disable-next-line react/no-danger -- generated from a fixed catalog, never user text
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * The list-row form: a bordered circle with the head cropped inside it. Used by
 * the leaderboard, explore feed, friend lists and anywhere a small round avatar
 * is expected.
 */
export function VaquitaAvatarCircle({
  config,
  seed = '',
  className = '',
  alt,
}: Pick<VaquitaAvatarProps, 'config' | 'seed' | 'className' | 'alt'>) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-black border-b-2 bg-white [&_svg]:h-full [&_svg]:w-full ${className}`}
    >
      <VaquitaAvatar config={config} seed={seed} crop="head" background alt={alt} className="block h-full w-full" />
    </span>
  );
}
