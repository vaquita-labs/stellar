'use client';

import { Division } from './leagues';

/* ------------------------------------------------------------------ */
/* Trophy art                                                          */
/* ------------------------------------------------------------------ */

/** Shield outline shared by every state, so locked and unlocked badges line up
 *  pixel for pixel in the carousel. */
const SHIELD = 'M50 6 L88 24 L88 58 C88 76 70 88 50 96 C30 88 12 76 12 58 L12 24 Z';
/** Right half of the shield, painted in the darker tone: one straight light
 *  break down the middle is what makes the flat SVG read as a faceted gem. */
const SHIELD_SHADE = 'M50 6 L88 24 L88 58 C88 76 70 88 50 96 Z';
/** Top facet — a thin highlight along the shoulders. */
const SHIELD_TOP = 'M50 6 L88 24 L50 38 L12 24 Z';
/** The chevron every division carries, in white. */
const CHEVRON = 'M28 40 L50 58 L72 40 L72 54 L50 72 L28 54 Z';

const GREY = { base: '#9aa3ad', dark: '#7a838d', light: '#c3cad1' };

/**
 * A division badge. Divisions the player hasn't reached render greyed out with
 * a padlock, exactly like the locked trophies in the reference: seeing the
 * ladder above you is half the motivation.
 */
export function LeagueTrophy({
  division,
  locked = false,
  size = 72,
  className = '',
}: {
  division: Division;
  locked?: boolean;
  size?: number;
  className?: string;
}) {
  const color = locked ? GREY : division.color;

  return (
    <svg
      viewBox="0 0 100 108"
      width={size}
      height={size * (108 / 100)}
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* Pedestal — reads as a plinth the badge is standing on. */}
      <ellipse cx="50" cy="99" rx="27" ry="6" fill="#000" opacity="0.08" />
      <ellipse cx="50" cy="97" rx="24" ry="5" fill="#dfe4e8" />

      <g>
        <path d={SHIELD} fill={color.base} />
        <path d={SHIELD_SHADE} fill={color.dark} />
        <path d={SHIELD_TOP} fill={color.light} />
        <path
          d={SHIELD}
          fill="none"
          stroke="#262626"
          strokeOpacity={locked ? 0.25 : 0.55}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {locked ? (
          <g fill="#eef1f4">
            {/* Padlock: shackle + body. */}
            <path
              d="M42 44v-6a8 8 0 0 1 16 0v6"
              fill="none"
              stroke="#eef1f4"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <rect x="36" y="44" width="28" height="22" rx="5" />
          </g>
        ) : (
          <path d={CHEVRON} fill="#ffffff" />
        )}
      </g>
    </svg>
  );
}
