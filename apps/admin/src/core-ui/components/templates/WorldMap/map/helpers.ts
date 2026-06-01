import { MapTile } from '@/core-ui/types/map';

export function getMapCenter(tiles: MapTile[]) {
  const xPositions = tiles.map((tile) => tile.position[0]);
  const zPositions = tiles.map((tile) => tile.position[2]);

  const centerX = (Math.min(...xPositions) + Math.max(...xPositions)) / 2;
  const centerZ = (Math.min(...zPositions) + Math.max(...zPositions)) / 2;

  return [centerX, -2, centerZ] as [number, number, number];
}
