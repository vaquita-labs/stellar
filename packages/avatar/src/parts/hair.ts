import { INK, STROKE, shade } from '../palettes';
import type { AvatarPart } from '../types';

export const HAIR: AvatarPart[] = [
  { id: 'none', render: () => '' },
  {
    id: 'buzz',
    render: ({ color }) =>
      `<path d="M55,76 Q55,42 100,42 Q145,42 145,76 L145,66 Q143,50 100,49 Q57,50 55,66 Z" fill="${color}" ${STROKE} stroke-width="6"/>`,
  },
  {
    id: 'short',
    render: ({ color }) =>
      `<path d="M53,82 Q51,28 100,28 Q149,28 147,82 Q145,50 100,47 Q55,50 53,82 Z" fill="${color}" ${STROKE} stroke-width="6"/>`,
  },
  {
    id: 'wavy',
    render: ({ color }) =>
      `<path d="M53,84 Q49,36 80,31 Q90,19 104,26 Q118,19 128,30 Q151,36 147,84 Q144,52 116,50 Q104,56 92,50 Q56,54 53,84 Z" fill="${color}" ${STROKE} stroke-width="6"/>`,
  },
  {
    id: 'curly',
    render: ({ color }) => `<path d="M55,76 Q55,42 100,42 Q145,42 145,76 L145,66 Q143,50 100,49 Q57,50 55,66 Z" fill="${color}" ${STROKE} stroke-width="6"/>
    <path d="M84,44 Q86,24 104,23 Q120,25 116,43 Q108,51 100,48 Q90,51 84,44 Z" fill="${color}" ${STROKE} stroke-width="6"/>
    <path d="M100,30 Q109,31 105,40 Q101,45 96,40" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
  },
  {
    id: 'afro',
    render: ({ color }) => `<circle cx="100" cy="48" r="42" fill="${color}" ${STROKE} stroke-width="6"/>
    <circle cx="58" cy="72" r="16" fill="${color}" ${STROKE} stroke-width="6"/>
    <circle cx="142" cy="72" r="16" fill="${color}" ${STROKE} stroke-width="6"/>
    <path d="M60,64 Q60,46 100,46 Q140,46 140,64 Z" fill="${color}"/>`,
  },
  {
    id: 'bangs',
    render: ({ color }) =>
      `<path d="M50,142 L50,64 Q50,26 100,26 Q150,26 150,64 L150,142 L134,142 L134,74 Q134,64 124,64 L76,64 Q66,64 66,74 L66,142 Z" fill="${color}" ${STROKE} stroke-width="6"/>`,
  },
  {
    id: 'long',
    render: ({ color }) =>
      `<path d="M48,148 Q44,24 100,24 Q156,24 152,148 L134,148 Q138,108 136,80 Q134,50 100,48 Q66,50 64,80 Q62,108 66,148 Z" fill="${color}" ${STROKE} stroke-width="6"/>`,
  },
  {
    id: 'ponytail',
    render: ({ color }) => `<path d="M53,82 Q51,28 100,28 Q149,28 147,82 Q145,50 100,47 Q55,50 53,82 Z" fill="${color}" ${STROKE} stroke-width="6"/>
    <ellipse cx="154" cy="112" rx="11" ry="27" fill="${color}" ${STROKE} stroke-width="6"/>
    <rect x="144" y="80" width="18" height="10" rx="5" fill="${shade(color, 0.72)}" ${STROKE} stroke-width="4.5"/>`,
  },
  {
    id: 'bun',
    render: ({ color }) => `<path d="M55,74 Q55,40 100,40 Q145,40 145,74 L145,64 Q143,48 100,47 Q57,48 55,64 Z" fill="${color}" ${STROKE} stroke-width="6"/>
    <circle cx="100" cy="28" r="14" fill="${color}" ${STROKE} stroke-width="6"/>`,
  },
  {
    id: 'braids',
    render: ({ color }) => `<path d="M53,82 Q51,28 100,28 Q149,28 147,82 Q145,50 100,47 Q55,50 53,82 Z" fill="${color}" ${STROKE} stroke-width="6"/>
    <g fill="${color}" ${STROKE} stroke-width="5">
      <circle cx="55" cy="96" r="9"/><circle cx="55" cy="112" r="9"/><circle cx="55" cy="128" r="8"/>
      <circle cx="145" cy="96" r="9"/><circle cx="145" cy="112" r="9"/><circle cx="145" cy="128" r="8"/>
    </g>
    <circle cx="55" cy="139" r="4" fill="${shade(color, 0.7)}"/>
    <circle cx="145" cy="139" r="4" fill="${shade(color, 0.7)}"/>`,
  },
];

export const FACIAL_HAIR: AvatarPart[] = [
  { id: 'none', render: () => '' },
  {
    id: 'moustache',
    render: ({ color }) =>
      `<path d="M70,106 Q77,94 100,100 Q123,94 130,106 Q131,119 115,120 Q105,114 100,116 Q95,114 85,120 Q69,119 70,106 Z" fill="${color}" ${STROKE} stroke-width="5"/>`,
  },
  {
    id: 'goatee',
    render: ({ color }) => `<path d="M83,108 Q91,101 100,106 Q109,101 117,108 Q109,113 100,110 Q91,113 83,108 Z" fill="${color}" ${STROKE} stroke-width="4.5"/>
    <ellipse cx="100" cy="130" rx="10" ry="7.5" fill="${color}" ${STROKE} stroke-width="4.5"/>`,
  },
  {
    id: 'beard',
    render: ({ color }) =>
      `<path d="M57,96 L57,110 Q60,142 100,143 Q140,142 143,110 L143,96 Q138,126 100,127 Q62,126 57,96 Z" fill="${color}" ${STROKE} stroke-width="5"/>`,
  },
  {
    id: 'full',
    render: ({ color }) => `<path d="M56,92 L56,110 Q58,150 100,150 Q142,150 144,110 L144,92 Q138,120 100,121 Q62,120 56,92 Z" fill="${color}" ${STROKE} stroke-width="5"/>
    <path d="M79,106 Q90,98 100,104 Q110,98 121,106 L121,114 L79,114 Z" fill="${color}"/>`,
  },
];
