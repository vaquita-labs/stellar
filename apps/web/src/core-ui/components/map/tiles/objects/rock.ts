import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../../constants';
import { getPalette } from '../palette';
import { addBoxes, addTerrainTile, BoxSpec } from '../recipe';

// Variantes: [alto de la losa, alto del pilar de esquina (opcional)],
// como fracción de TILE_HEIGHT. El índice del array es el `variant`.
const ROCK_VARIANTS: Array<[number, number?]> = [
  [0.3],
  [0.6],
  [0.9],
  [0.1, 0.35],
  [0.4, 0.65],
  [0.7, 0.95],
];

const rockRecipe = (slabHeight: number, pillarHeight: number | undefined, color: string): BoxSpec[] => {
  const slab = slabHeight * TILE_HEIGHT;
  const specs: BoxSpec[] = [{ size: [TILE_SIZE, slab, TILE_SIZE], at: [0, slab / 2, 0], color }];
  if (pillarHeight !== undefined) {
    const pillar = pillarHeight * TILE_HEIGHT;
    specs.push({ size: [TILE_SIZE * 0.4, pillar, TILE_SIZE * 0.4], at: [-0.2, pillar / 2, -0.2], color });
  }
  return specs;
};

export const getRockGroup = ({ position: [x, , z], variant }: MapObject, worldType: WorldType) => {
  const palette = getPalette(worldType);
  const group = new THREE.Group();

  addTerrainTile(group, x, z, palette.rock);

  const spec = ROCK_VARIANTS[variant];
  if (spec) {
    addBoxes(group, [x, 0, z], rockRecipe(spec[0], spec[1], palette.rock));
  }

  return group;
};
