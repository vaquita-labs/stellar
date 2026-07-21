import { INK, STROKE, shade } from '../palettes';
import type { AvatarPart } from '../types';

/** Torso silhouette shared by every non-hoodie top (shoulders start at y=144). */
const TORSO = (color: string) =>
  `<path d="M35,200 L35,176 Q35,148 70,144 L130,144 Q165,148 165,176 L165,200 Z" fill="${color}" ${STROKE} stroke-width="7"/>`;

export const CLOTHES: AvatarPart[] = [
  {
    id: 'turtleneck',
    render: ({ color }) => `
    ${TORSO(color)}
    <rect x="80" y="128" width="40" height="28" rx="10" fill="${color}" ${STROKE} stroke-width="6"/>
    <rect x="83" y="131" width="34" height="8" rx="4" fill="${shade(color, 0.8)}"/>`,
  },
  {
    id: 'tee',
    render: ({ color }) => `
    ${TORSO(color)}
    <path d="M83,145 Q100,159 117,145 L117,153 Q100,167 83,153 Z" fill="${shade(color, 0.78)}"/>`,
  },
  {
    id: 'hoodie',
    render: ({ color }) => `
    <path d="M31,200 L31,174 Q31,142 66,139 L134,139 Q169,142 169,174 L169,200 Z" fill="${color}" ${STROKE} stroke-width="7"/>
    <path d="M68,140 Q100,172 132,140 L132,152 Q100,184 68,152 Z" fill="${shade(color, 0.78)}" ${STROKE} stroke-width="5"/>
    <line x1="87" y1="164" x2="87" y2="188" stroke="${shade(color, 0.65)}" stroke-width="5" stroke-linecap="round"/>
    <line x1="113" y1="164" x2="113" y2="188" stroke="${shade(color, 0.65)}" stroke-width="5" stroke-linecap="round"/>`,
  },
  {
    id: 'shirt',
    render: ({ color }) => `
    ${TORSO(color)}
    <path d="M89,145 L100,160 L111,145 L119,153 L100,174 L81,153 Z" fill="#F5F2EC" ${STROKE} stroke-width="4.5"/>
    <circle cx="100" cy="181" r="3" fill="${INK}"/>
    <circle cx="100" cy="193" r="3" fill="${INK}"/>`,
  },
  {
    id: 'sweater',
    render: ({ color }) => `
    ${TORSO(color)}
    <rect x="81" y="138" width="38" height="12" rx="6" fill="${shade(color, 0.78)}" ${STROKE} stroke-width="5"/>
    <path d="M44,180 L156,180 M44,192 L156,192" stroke="${shade(color, 0.82)}" stroke-width="4.5"/>`,
  },
];
