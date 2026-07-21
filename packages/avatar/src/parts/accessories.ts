import { INK, STROKE, shade } from '../palettes';
import type { AvatarPart } from '../types';

export const GLASSES: AvatarPart[] = [
  { id: 'none', render: () => '' },
  {
    id: 'round',
    render: () => `
    <circle cx="79" cy="91" r="17" fill="none" stroke="${INK}" stroke-width="5.5"/>
    <circle cx="121" cy="91" r="17" fill="none" stroke="${INK}" stroke-width="5.5"/>
    <line x1="95" y1="87" x2="105" y2="87" stroke="${INK}" stroke-width="5.5"/>
    <line x1="62" y1="87" x2="53" y2="84" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>
    <line x1="138" y1="87" x2="147" y2="84" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>`,
  },
  {
    id: 'square',
    render: () => `
    <rect x="63" y="78" width="31" height="26" rx="7" fill="none" stroke="${INK}" stroke-width="5.5"/>
    <rect x="106" y="78" width="31" height="26" rx="7" fill="none" stroke="${INK}" stroke-width="5.5"/>
    <line x1="94" y1="87" x2="106" y2="87" stroke="${INK}" stroke-width="5.5"/>`,
  },
  {
    id: 'sunglasses',
    render: () => `
    <rect x="62" y="79" width="33" height="25" rx="10" fill="${INK}"/>
    <rect x="105" y="79" width="33" height="25" rx="10" fill="${INK}"/>
    <line x1="95" y1="86" x2="105" y2="86" stroke="${INK}" stroke-width="5.5"/>
    <rect x="67" y="83" width="11" height="5" rx="2.5" fill="#5A5A5A"/>
    <rect x="110" y="83" width="11" height="5" rx="2.5" fill="#5A5A5A"/>`,
  },
];

/**
 * `coversHair: true` clips the hair to the area below the hat line, so only the
 * sides/back show — otherwise a tall hairstyle punches straight through the cap.
 */
export const HATS: AvatarPart[] = [
  { id: 'none', render: () => '' },
  {
    id: 'cap',
    coversHair: true,
    render: () => `
    <path d="M56,68 Q56,32 100,32 Q144,32 144,68 L144,72 L56,72 Z" fill="#3E7C59" ${STROKE} stroke-width="6"/>
    <path d="M56,66 L28,72 Q24,80 34,80 L58,74 Z" fill="#2F5F44" ${STROKE} stroke-width="5"/>
    <circle cx="100" cy="34" r="4.5" fill="#2F5F44" ${STROKE} stroke-width="4"/>`,
  },
  {
    id: 'beanie',
    coversHair: true,
    render: () => `
    <path d="M55,66 Q55,28 100,28 Q145,28 145,66 L145,70 L55,70 Z" fill="#3B6EA5" ${STROKE} stroke-width="6"/>
    <rect x="53" y="60" width="94" height="15" rx="7.5" fill="#2E5680" ${STROKE} stroke-width="5"/>`,
  },
  {
    id: 'chullo',
    coversHair: true,
    render: () => `
    <path d="M55,70 Q55,24 100,24 Q145,24 145,70 L145,76 L55,76 Z" fill="#C24B3A" ${STROKE} stroke-width="6"/>
    <rect x="55" y="62" width="90" height="14" fill="#8C3427" ${STROKE} stroke-width="4.5"/>
    <path d="M60,62 L67,69 L74,62 L81,69 L88,62 L95,69 L102,62 L109,69 L116,62 L123,69 L130,62 L137,69" stroke="#F2E8D5" stroke-width="3" fill="none"/>
    <path d="M57,76 L52,104 Q52,112 61,110 L66,76 Z" fill="#C24B3A" ${STROKE} stroke-width="5"/>
    <path d="M143,76 L148,104 Q148,112 139,110 L134,76 Z" fill="#C24B3A" ${STROKE} stroke-width="5"/>
    <circle cx="100" cy="22" r="6.5" fill="#F2E8D5" ${STROKE} stroke-width="4.5"/>`,
  },
  {
    id: 'flower',
    render: () => `
    <g ${STROKE} stroke-width="4">
      <circle cx="61" cy="55" r="6" fill="#F2A9B4"/><circle cx="73" cy="51" r="6" fill="#F2A9B4"/>
      <circle cx="70" cy="63" r="6" fill="#F2A9B4"/><circle cx="59" cy="66" r="6" fill="#F2A9B4"/>
      <circle cx="66" cy="58" r="4.5" fill="#E9B84C"/>
    </g>`,
  },
  {
    id: 'crown',
    render: () => `
    <path d="M72,40 L72,20 L83,31 L94,15 L106,31 L117,15 L128,31 L128,40 Z" fill="#E9B84C" ${STROKE} stroke-width="5"/>
    <circle cx="94" cy="11" r="3" fill="#C24B3A" ${STROKE} stroke-width="3"/>`,
  },
];

/** Ears sit at (52,97) and (148,97) with r=12 — earrings hang off their lower edge. */
export const EARRINGS: AvatarPart[] = [
  { id: 'none', render: () => '' },
  {
    id: 'studs',
    render: ({ color }) => `
    <circle cx="50" cy="104" r="4.5" fill="${color}" ${STROKE} stroke-width="3"/>
    <circle cx="150" cy="104" r="4.5" fill="${color}" ${STROKE} stroke-width="3"/>`,
  },
  {
    id: 'hoops',
    render: ({ color }) => `
    <circle cx="50" cy="112" r="9" fill="none" stroke="${INK}" stroke-width="6"/>
    <circle cx="150" cy="112" r="9" fill="none" stroke="${INK}" stroke-width="6"/>
    <circle cx="50" cy="112" r="9" fill="none" stroke="${color}" stroke-width="3"/>
    <circle cx="150" cy="112" r="9" fill="none" stroke="${color}" stroke-width="3"/>`,
  },
  {
    id: 'drops',
    render: ({ color }) => `
    <line x1="50" y1="104" x2="50" y2="112" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="150" y1="104" x2="150" y2="112" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M50,110 L56,119 L50,127 L44,119 Z" fill="${color}" ${STROKE} stroke-width="3.5"/>
    <path d="M150,110 L156,119 L150,127 L144,119 Z" fill="${color}" ${STROKE} stroke-width="3.5"/>`,
  },
  {
    id: 'feathers',
    render: ({ color }) => `
    <line x1="50" y1="104" x2="50" y2="110" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="150" y1="104" x2="150" y2="110" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="50" cy="120" rx="5" ry="11" fill="${color}" ${STROKE} stroke-width="3.5"/>
    <ellipse cx="150" cy="120" rx="5" ry="11" fill="${color}" ${STROKE} stroke-width="3.5"/>
    <line x1="50" y1="112" x2="50" y2="128" stroke="${shade(color, 0.7)}" stroke-width="2.5"/>
    <line x1="150" y1="112" x2="150" y2="128" stroke="${shade(color, 0.7)}" stroke-width="2.5"/>`,
  },
];
