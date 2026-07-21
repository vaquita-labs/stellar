import { INK, STROKE, shade } from '../palettes';
import type { AvatarPart } from '../types';

/**
 * Canvas: 200x200 · head x55-145 y42-140 · eyes y91 · shoulders y146.
 * Every part below is authored against that grid, so a new hat/glasses/earring
 * only has to respect those anchors to line up with the rest.
 */

export const BACKGROUNDS: AvatarPart[] = [
  { id: 'solid', render: ({ color }) => `<rect width="200" height="200" fill="${color}"/>` },
];

export const NECKS: AvatarPart[] = [
  {
    id: 'default',
    render: ({ skin }) =>
      `<rect x="85" y="120" width="30" height="34" rx="6" fill="${shade(skin, 0.9)}" ${STROKE} stroke-width="6"/>`,
  },
];

export const HEADS: AvatarPart[] = [
  {
    id: 'default',
    render: ({ skin }) => `
  <circle cx="52" cy="97" r="12" fill="${skin}" ${STROKE} stroke-width="6"/>
  <circle cx="148" cy="97" r="12" fill="${skin}" ${STROKE} stroke-width="6"/>
  <rect x="55" y="42" width="90" height="98" rx="34" fill="${skin}" ${STROKE} stroke-width="7"/>
  <path d="M95,105 Q100,110 105,105" fill="none" stroke="${shade(skin, 0.72)}" stroke-width="4.5" stroke-linecap="round"/>
  <ellipse cx="70" cy="108" rx="8" ry="5.5" fill="#E8987F" opacity="0.55"/>
  <ellipse cx="130" cy="108" rx="8" ry="5.5" fill="#E8987F" opacity="0.55"/>`,
  },
];

export const EYES: AvatarPart[] = [
  {
    id: 'normal',
    render: () => `<ellipse cx="79" cy="91" rx="6" ry="8.5" fill="${INK}"/>
    <ellipse cx="121" cy="91" rx="6" ry="8.5" fill="${INK}"/>
    <circle cx="81" cy="88.5" r="1.8" fill="#fff"/>
    <circle cx="123" cy="88.5" r="1.8" fill="#fff"/>`,
  },
  {
    id: 'wink',
    render: () => `<ellipse cx="79" cy="91" rx="6" ry="8.5" fill="${INK}"/>
    <circle cx="81" cy="88.5" r="1.8" fill="#fff"/>
    <path d="M111,91 Q121,83 131,91" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>`,
  },
  {
    id: 'happy',
    render: () => `<path d="M70,92 Q79,83 88,92" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M112,92 Q121,83 130,92" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>`,
  },
  {
    id: 'lashes',
    render: () => `<ellipse cx="79" cy="91" rx="6" ry="8.5" fill="${INK}"/>
    <ellipse cx="121" cy="91" rx="6" ry="8.5" fill="${INK}"/>
    <circle cx="81" cy="88.5" r="1.8" fill="#fff"/>
    <circle cx="123" cy="88.5" r="1.8" fill="#fff"/>
    <path d="M70,85 L64,80 M71,80 L66,74" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M130,85 L136,80 M129,80 L134,74" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
  },
];

export const BROWS: AvatarPart[] = [
  {
    id: 'default',
    render: ({ hair }) => `
  <path d="M70,74 Q79,70 88,74" fill="none" stroke="${shade(hair, 0.9)}" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M112,74 Q121,70 130,74" fill="none" stroke="${shade(hair, 0.9)}" stroke-width="5.5" stroke-linecap="round"/>`,
  },
];

export const MOUTHS: AvatarPart[] = [
  {
    id: 'smile',
    render: () =>
      `<path d="M91,116 Q100,124 109,116" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
  },
  {
    id: 'grin',
    render: () => `<path d="M87,114 Q100,131 113,114 Z" fill="#7A3B33" ${STROKE} stroke-width="4.5"/>
    <path d="M92,114 Q100,121 108,114 Z" fill="#fff"/>`,
  },
  {
    id: 'neutral',
    render: () =>
      `<line x1="92" y1="118" x2="108" y2="118" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
  },
];
