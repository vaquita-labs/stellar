import { MapObject } from '@/core-ui/types';
import * as THREE from 'three';
import { BuildContext } from '@/core-ui/components/map/types';
import { getPalette } from '@/core-ui/components/map/tiles/palette';
import { addBoxes, addFixedTerrainTile, BoxSpec } from '@/core-ui/components/map/tiles/recipe';

// ---------------------------------------------------------------------------
// Montañas de piedra toon. Cada variante es un cluster de columnas grises
// facetadas (más alta al centro) con un peñasco claro en el pico, musgo en la
// base (anillo donde la roca toca el pasto) y en repisas visibles, y piedritas
// alrededor. Bisel chico → roca angular, no dedos. Diseño validado con el
// pipeline toon (faceShade + inverted-hull). Sobre un tile de PASTO como el
// resto de la decoración. Ver objects/tree.ts para el estilo toon.
// ---------------------------------------------------------------------------

const OUTLINE = 0.02;
const BV = 0.03;
const TOON = { material: 'toon', faceShade: true, receiveShadow: false } as const;

const STONE = '#9AA0A4';
const STONE_DK = '#7C8288';
const STONE_LT = '#C3C8CB';
const MOSS = '#6FA33C';

interface Chunk {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  c?: string;
  r?: number; // rotación Y
  b?: number; // bisel
}
interface Tuft {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h?: number;
}

// Un peñasco: caja gris biselada con la base en la superficie (y=0).
const chunk = (c: Chunk): BoxSpec => ({
  ...TOON,
  size: [c.w, c.h, c.d],
  at: [c.x, c.h / 2, c.z],
  color: c.c ?? STONE,
  bevel: c.b ?? BV,
  outline: OUTLINE,
  rotationY: c.r ?? 0,
});
// Mata de musgo (cajita verde chata, sin contorno).
const tuft = (m: Tuft): BoxSpec => ({ ...TOON, size: [m.w, m.h ?? 0.06, m.d], at: [m.x, m.y, m.z], color: MOSS, bevel: 0.02, outline: 0 });

/** Compone una montaña: columnas + pico claro + anillo de musgo en la base + musgo en repisas + piedritas. */
const mountain = (pillars: Chunk[], peak: Chunk, ledgeMoss: Tuft[], baseRocks: Chunk[], mossR = 0.34): BoxSpec[] => {
  const specs: BoxSpec[] = pillars.map(chunk);
  specs.push(chunk({ ...peak, c: STONE_LT, b: 0.1, r: peak.r ?? 0.6 }));
  // Anillo de musgo alrededor de la base (donde la roca toca el pasto).
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = mossR * (0.9 + 0.25 * Math.abs(Math.sin(i * 2.3)));
    specs.push(tuft({ x: Math.cos(a) * rr, y: 0.03, z: Math.sin(a) * rr, w: 0.13, d: 0.11, h: 0.05 }));
  }
  for (const m of ledgeMoss) specs.push(tuft(m));
  for (const b of baseRocks) specs.push(chunk({ ...b, c: b.c ?? STONE_DK, b: 0.05 }));
  return specs;
};

/** Pico alto y cohesivo (columnas muy juntas que se solapan). */
const mountainTall = (): BoxSpec[] =>
  mountain(
    [
      { x: 0, z: 0, w: 0.32, d: 0.32, h: 0.98, c: STONE, r: 0.4 },
      { x: 0.22, z: 0.03, w: 0.26, d: 0.28, h: 0.66, c: STONE_DK },
      { x: -0.2, z: 0.05, w: 0.28, d: 0.24, h: 0.72, c: STONE, r: 0.3 },
      { x: 0.05, z: 0.22, w: 0.28, d: 0.24, h: 0.58, c: STONE_DK },
      { x: 0.03, z: -0.22, w: 0.26, d: 0.26, h: 0.62, c: STONE, r: -0.3 },
      { x: 0.26, z: 0.24, w: 0.2, d: 0.2, h: 0.42, c: STONE_DK },
      { x: -0.24, z: -0.2, w: 0.22, d: 0.22, h: 0.46, c: STONE },
    ],
    { x: 0, z: 0.01, w: 0.28, d: 0.28, h: 0.22 },
    [
      { x: 0.05, y: 0.58, z: 0.22, w: 0.2, d: 0.16 },
      { x: -0.2, y: 0.72, z: 0.05, w: 0.16, d: 0.14 },
      { x: 0.26, y: 0.42, z: 0.24, w: 0.14, d: 0.14 },
    ],
    [
      { x: -0.34, z: 0.32, w: 0.16, d: 0.16, h: 0.18 },
      { x: 0.36, z: -0.28, w: 0.18, d: 0.16, h: 0.16 },
      { x: 0.34, z: 0.34, w: 0.13, d: 0.13, h: 0.13 },
    ]
  );

/** Macizo ancho de doble cresta. */
const mountainMassif = (): BoxSpec[] =>
  mountain(
    [
      { x: -0.13, z: 0, w: 0.34, d: 0.36, h: 0.82, c: STONE, r: 0.35 },
      { x: 0.2, z: -0.05, w: 0.32, d: 0.32, h: 0.66, c: STONE_DK, r: -0.2 },
      { x: 0.03, z: 0.22, w: 0.3, d: 0.24, h: 0.52, c: STONE },
      { x: -0.26, z: -0.18, w: 0.24, d: 0.24, h: 0.46, c: STONE_DK },
      { x: 0.28, z: 0.22, w: 0.22, d: 0.22, h: 0.44, c: STONE, r: 0.2 },
    ],
    { x: -0.13, z: 0, w: 0.24, d: 0.24, h: 0.2 },
    [
      { x: 0.03, y: 0.52, z: 0.22, w: 0.16, d: 0.12 },
      { x: 0.2, y: 0.66, z: -0.05, w: 0.14, d: 0.12 },
    ],
    [
      { x: 0.36, z: -0.3, w: 0.16, d: 0.16, h: 0.15 },
      { x: -0.34, z: 0.32, w: 0.13, d: 0.13, h: 0.12 },
    ]
  );

/** Riscos / boulders bajos (variante chica). */
const mountainBoulders = (): BoxSpec[] =>
  mountain(
    [
      { x: 0, z: 0, w: 0.42, d: 0.42, h: 0.46, c: STONE, r: 0.3 },
      { x: 0.24, z: 0.16, w: 0.28, d: 0.26, h: 0.32, c: STONE_DK },
      { x: -0.2, z: -0.14, w: 0.28, d: 0.24, h: 0.36, c: STONE, r: -0.2 },
      { x: 0.16, z: -0.2, w: 0.22, d: 0.22, h: 0.28, c: STONE_DK },
    ],
    { x: 0, z: 0, w: 0.3, d: 0.3, h: 0.18 },
    [
      { x: 0.24, y: 0.32, z: 0.16, w: 0.16, d: 0.14 },
      { x: -0.14, y: 0.36, z: -0.14, w: 0.12, d: 0.1 },
    ],
    [
      { x: 0.36, z: -0.28, w: 0.15, d: 0.15, h: 0.12 },
      { x: -0.34, z: 0.3, w: 0.13, d: 0.13, h: 0.1 },
    ],
    0.4
  );

// El índice del array es el `variant` del MapObject (NO reordenar/borrar: la
// tienda y los mapas guardados usan el 3 = pico alto).
const MOUNTAIN_VARIANTS: Array<() => BoxSpec[]> = [
  mountainBoulders,
  mountainMassif,
  mountainTall,
  mountainTall,
  mountainMassif,
  mountainBoulders,
];

export const getRockGroup = ({ position: [x, , z], variant, rotation }: MapObject, ctx: BuildContext) => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();

  // Tile de PASTO fijo a la grilla (contra-rotado); solo la montaña rota.
  addFixedTerrainTile(group, x, z, palette.treeTerrain, ctx, rotation?.[1] ?? 0);

  const build = MOUNTAIN_VARIANTS[variant];
  if (build) {
    addBoxes(group, [x, 0, z], build());
  }

  return group;
};
