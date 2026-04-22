import { MAP_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapStoreType } from '@/core-ui/stores';

const directions: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const getNextValidTile = (pos: [number, number], isWalkable: MapStoreType['isWalkable']): [number, number] => {
  for (const [dx, dz] of directions.sort(() => 0.5 - Math.random())) {
    const [x, z] = [pos[0] + dx, pos[1] + dz];
    if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;

    if (isWalkable(x, z)) {
      return [x, z];
    }
  }

  return pos;
};
