import { MAP_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapStoreType } from '@/core-ui/stores';
import { MapObjectType } from '@/core-ui/types';

const directions: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const inBounds = (x: number, z: number) => x >= 0 && z >= 0 && x < MAP_SIZE && z < MAP_SIZE;

const tilesEqual = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

export type IsOccupiedFn = (x: number, z: number) => boolean;

export const getNextValidTile = (pos: [number, number], isWalkable: MapStoreType['isWalkable']): [number, number] => {
  for (const [dx, dz] of [...directions].sort(() => 0.5 - Math.random())) {
    const x = pos[0] + dx;
    const z = pos[1] + dz;
    if (!inBounds(x, z)) continue;
    if (isWalkable(x, z)) return [x, z];
  }
  return pos;
};

export const getNextTileToward = (
  current: [number, number],
  goal: [number, number],
  isWalkable: MapStoreType['isWalkable'],
  isOccupied?: IsOccupiedFn,
): [number, number] => {
  const candidates: { tile: [number, number]; dist: number }[] = [];
  for (const [dx, dz] of directions) {
    const x = current[0] + dx;
    const z = current[1] + dz;
    if (!inBounds(x, z)) continue;
    if (!isWalkable(x, z)) continue;
    if (isOccupied?.(x, z)) continue;
    candidates.push({ tile: [x, z], dist: Math.abs(x - goal[0]) + Math.abs(z - goal[1]) });
  }
  if (candidates.length === 0) return current;
  candidates.sort((a, b) => a.dist - b.dist);
  const minDist = candidates[0].dist;
  const best = candidates.filter((c) => c.dist === minDist);
  return best[Math.floor(Math.random() * best.length)].tile;
};

export const pickRandomWalkableGoal = (
  current: [number, number],
  isWalkable: MapStoreType['isWalkable'],
  isOccupied?: IsOccupiedFn,
  range: number = 3,
): [number, number] => {
  for (let i = 0; i < 30; i++) {
    const dx = Math.floor(Math.random() * (range * 2 + 1)) - range;
    const dz = Math.floor(Math.random() * (range * 2 + 1)) - range;
    if (dx === 0 && dz === 0) continue;
    const x = current[0] + dx;
    const z = current[1] + dz;
    if (!inBounds(x, z)) continue;
    if (!isWalkable(x, z)) continue;
    if (isOccupied?.(x, z)) continue;
    return [x, z];
  }
  return current;
};

export const findNearbyWorkSpot = (
  current: [number, number],
  getTileAt: MapStoreType['getTileAt'],
  isWalkable: MapStoreType['isWalkable'],
  isOccupied?: IsOccupiedFn,
  radius: number = 6,
): [number, number] | null => {
  const candidates: { standTile: [number, number]; dist: number }[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const x = current[0] + dx;
      const z = current[1] + dz;
      if (!inBounds(x, z)) continue;
      const tile = getTileAt(x, z);
      if (!tile) continue;
      if (tile.type !== MapObjectType.TREE && tile.type !== MapObjectType.ROCK) continue;
      for (const [adx, adz] of directions) {
        const sx = x + adx;
        const sz = z + adz;
        if (!inBounds(sx, sz)) continue;
        if (!isWalkable(sx, sz)) continue;
        if (isOccupied?.(sx, sz)) continue;
        candidates.push({
          standTile: [sx, sz],
          dist: Math.abs(sx - current[0]) + Math.abs(sz - current[1]),
        });
        break;
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  const top = candidates.slice(0, Math.min(3, candidates.length));
  return top[Math.floor(Math.random() * top.length)].standTile;
};

export { tilesEqual };
