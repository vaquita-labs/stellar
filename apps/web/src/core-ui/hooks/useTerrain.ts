import { competitiveMap } from '@/core-ui/components/templates/WorldMap/map/competitiveMap';
import { positionKey } from '@/core-ui/helpers/map';
import { TileType } from '@/core-ui/types';

export const useTerrain = () => {
  const tileTypes = new Map<string, TileType>();

  for (const tile of competitiveMap) {
    const key = positionKey(tile.position[0], tile.position[2]);

    if (tile.terrain === 'water') {
      tileTypes.set(key, 'water');
    } else if (tile.terrain === 'road') {
      tileTypes.set(key, 'road');
    } else if (tile.object === 'tree') {
      tileTypes.set(key, 'tree');
    } else if (tile.object === 'rock') {
      tileTypes.set(key, 'rock');
    } else if (tile.object === 'bush') {
      tileTypes.set(key, 'bush');
    } else if (tile.object === 'bank') {
      tileTypes.set(key, 'bank');
    } else if (tile.object === 'barn') {
      tileTypes.set(key, 'barn');
    }else {
      tileTypes.set(key, 'empty');
    }
  }

  return {
    tileTypes,
    map: competitiveMap,
  };
};
