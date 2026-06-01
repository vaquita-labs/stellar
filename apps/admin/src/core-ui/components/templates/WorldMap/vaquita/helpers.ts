import { MAP_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { positionKey } from '@/core-ui/helpers/map';
import { TileType } from '@/core-ui/types';

export const getNextValidTile = (pos: [number, number], tileTypes: Map<string, TileType>): [number, number] => {
  const directions: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const passable: TileType[] = ['empty', 'bush'];

  for (const [dx, dz] of directions.sort(() => 0.5 - Math.random())) {
    const [x, z] = [pos[0] + dx, pos[1] + dz];
    if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;

    const key = positionKey(x, z);
    const tile = tileTypes.get(key) ?? 'empty';

    if (passable.includes(tile)) {
      return [x, z];
    }
  }

  return pos;
};
