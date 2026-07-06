import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { getPalette, WorldPalette } from '../palette';
import { addBoxes, addTerrainTile, BoxSpec } from '../recipe';

// Ramitas verticales (bosque): [dx, dz, alto] de cada tallo.
const BRANCH_STICKS: Array<[number, number, number]> = [
  [-0.22, -0.18, 0.45],
  [0.03, -0.2, 0.5],
  [0.18, 0.1, 0.6],
  [-0.15, 0.2, 0.55],
  [0.3, 0.3, 0.5],
  [0.4, 0.1, 0.6],
];

const branchBush = (color: string): BoxSpec[] =>
  BRANCH_STICKS.map(([dx, dz, height]) => ({
    size: [0.1, height, 0.1],
    at: [dx, height / 2, dz],
    color,
    material: 'lambert',
  }));

// Piedritas del desierto (sin sombras, como el original).
const desertRocks = (sand: string, sandDark: string): BoxSpec[] => [
  { size: [0.3, 0.25, 0.3], at: [0, -0.155, 0], color: sand, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.2, 0.18, 0.2], at: [0.25, -0.15, 0.15], color: sandDark, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.15, 0.12, 0.15], at: [-0.2, -0.15, 0.2], color: sand, material: 'lambert', castShadow: false, receiveShadow: false },
];

// Calavera del volcán (sin sombras, como el original).
const skull = (bone: string, dark: string): BoxSpec[] => [
  { size: [0.4, 0.4, 0.4], at: [0, 0, 0], color: bone, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.1, 0.1, 0.05], at: [-0.1, 0, 0.21], color: dark, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.1, 0.1, 0.05], at: [0.1, 0, 0.21], color: dark, material: 'lambert', castShadow: false, receiveShadow: false },
  { size: [0.08, 0.12, 0.05], at: [0, -0.1, 0.21], color: dark, material: 'lambert', castShadow: false, receiveShadow: false },
];

const BUSH_RECIPES: Record<WorldType, (p: WorldPalette) => BoxSpec[]> = {
  [WorldType.FOREST]: (p) => branchBush(p.bushBranch),
  [WorldType.DESERT]: (p) => desertRocks(p.sand, p.sandDark),
  [WorldType.VOLCANO]: (p) => skull(p.bone, p.dark),
};

export const getBushGroup = ({ position: [x, , z] }: MapObject, worldType: WorldType) => {
  const palette = getPalette(worldType);
  const group = new THREE.Group();

  addTerrainTile(group, x, z, palette.bushTerrain);

  const recipe = BUSH_RECIPES[worldType] || BUSH_RECIPES[WorldType.FOREST];
  addBoxes(group, [x, 0, z], recipe(palette));

  return group;
};
