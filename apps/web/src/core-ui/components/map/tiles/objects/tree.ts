import { getTileTopY } from '@/core-ui/helpers/map';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { getPalette, WorldPalette } from '../palette';
import { addBoxes, addTerrainTile, BoxSpec } from '../recipe';

// ---------------------------------------------------------------------------
// Formas: cada función devuelve la receta (lista de cajas) de una silueta de
// árbol, parametrizada por color. Los offsets son relativos al tope del tile.
// ---------------------------------------------------------------------------

/** Árbol clásico: tronco + copa en 3 niveles. */
const crownTree = (trunk: string, leaf: string): BoxSpec[] => [
  { size: [0.2, 1, 0.2], at: [0, 0, 0], color: trunk },
  { size: [0.6, 0.5, 0.6], at: [0, 0, 0], color: leaf },
  { size: [0.4, 0.5, 0.4], at: [0, 0.3, 0], color: leaf },
  { size: [0.2, 0.3, 0.2], at: [0, 0.6, 0], color: leaf },
];

/** Árbol redondo: tronco + una sola copa. */
const roundTree = (trunk: string, leaf: string): BoxSpec[] => [
  { size: [0.2, 1, 0.2], at: [0, 0, 0], color: trunk },
  { size: [0.6, 0.7, 0.6], at: [0, 0.2, 0], color: leaf },
];

/** Árbol de copa doble (asimétrico). */
const doubleCrownTree = (trunk: string, leaf: string): BoxSpec[] => [
  ...roundTree(trunk, leaf),
  { size: [0.4, 0.7, 0.5], at: [0.2, 0.4, 0.2], color: leaf },
];

/** Cactus chico con dos brazos. */
const cactus = (color: string): BoxSpec[] => [
  { size: [0.2, 1, 0.2], at: [0, 0, 0], color },
  { size: [0.1, 0.5, 0.1], at: [0.2, 0.2, 0], color },
  { size: [0.1, 0.4, 0.1], at: [-0.2, 0.15, 0], color },
  { size: [0.4, 0.1, 0.1], at: [0, 0, 0], color },
];

/** Palmera: tronco fino + hojas en cruz. */
const palmTree = (trunk: string, leaf: string): BoxSpec[] => [
  { size: [0.15, 1, 0.15], at: [0, 0, 0], color: trunk },
  { size: [0.2, 0.05, 0.5], at: [0, 0.5, 0.25], color: leaf },
  { size: [0.2, 0.05, 0.5], at: [0, 0.5, -0.25], color: leaf },
  { size: [0.5, 0.05, 0.2], at: [0.25, 0.5, 0], color: leaf },
  { size: [0.5, 0.05, 0.2], at: [-0.25, 0.5, 0], color: leaf },
];

/** Cactus grande con base en cruz. */
const bigCactus = (color: string): BoxSpec[] => [
  { size: [0.3, 1, 0.3], at: [0, 0, 0], color },
  { size: [0.1, 0.5, 0.1], at: [0.3, 0.2, 0], color },
  { size: [0.1, 0.2, 0.1], at: [-0.3, -0.1, 0], color },
  { size: [0.7, 0.1, 0.1], at: [0, 0, 0], color },
  { size: [0.4, 0.1, 0.1], at: [0, -0.5, 0], color },
  { size: [0.1, 0.1, 0.4], at: [0, -0.5, 0], color },
];

/** Calabaza (con o sin ojos). Escalada 0.8 y apoyada sobre el tile. */
const pumpkin = (body: string, dark: string, withEyes: boolean): BoxSpec[] => {
  const s = 0.8;
  const at = (x: number, y: number, z: number): [number, number, number] => [x * s, -0.65 + y * s, z * s];
  const specs: BoxSpec[] = [{ size: [0.7 * s, 0.7 * s, 0.7 * s], at: at(0, 0, 0), color: body, receiveShadow: false }];
  if (withEyes) {
    specs.push(
      { size: [0.1 * s, 0.1 * s, 0.01 * s], at: at(-0.2, 0.18, 0.35), color: dark, castShadow: false, receiveShadow: false },
      { size: [0.1 * s, 0.1 * s, 0.01 * s], at: at(0.15, 0.18, 0.35), color: dark, castShadow: false, receiveShadow: false }
    );
  }
  return specs;
};

/** Tronco seco con ramas quebradas. */
const deadTree = (color: string): BoxSpec[] => [
  { size: [0.2, 0.8, 0.2], at: [0, -0.65, 0], color },
  { size: [0.4, 0.1, 0.1], at: [0.2, -0.35, 0], color },
  { size: [0.3, 0.1, 0.1], at: [-0.2, -0.5, 0], color },
  { size: [0.15, 0.2, 0.15], at: [0.05, -0.15, 0], color },
];

// ---------------------------------------------------------------------------
// Variantes por mundo: el índice del array es el `variant` del MapObject.
// ---------------------------------------------------------------------------

const TREE_VARIANTS: Record<WorldType, (p: WorldPalette) => BoxSpec[][]> = {
  [WorldType.FOREST]: (p) => [
    crownTree(p.trunk, p.leaf),
    roundTree(p.trunk, p.leaf),
    doubleCrownTree(p.trunk, p.leaf),
    cactus(p.cactus),
    palmTree(p.trunk, p.leafDark),
    bigCactus(p.cactus),
    pumpkin(p.pumpkin, p.dark, true),
    deadTree(p.deadWood),
  ],
  [WorldType.DESERT]: (p) => [cactus(p.sand), palmTree(p.sand, p.leaf), bigCactus(p.trunk)],
  [WorldType.VOLCANO]: (p) => [pumpkin(p.pumpkin, p.dark, false), deadTree(p.deadWood), deadTree(p.deadWood)],
};

export const getTreeGroup = ({ position: [x, , z], variant }: MapObject, worldType: WorldType) => {
  const palette = getPalette(worldType);
  const group = new THREE.Group();

  addTerrainTile(group, x, z, palette.treeTerrain);

  const variants = (TREE_VARIANTS[worldType] || TREE_VARIANTS[WorldType.FOREST])(palette);
  const recipe = variants[variant];
  if (recipe) {
    addBoxes(group, [x, getTileTopY(), z], recipe);
  }

  return group;
};
