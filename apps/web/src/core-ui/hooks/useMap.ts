import { MapTile } from '@/core-ui/types/map';
import { useCallback, useState } from 'react';

export const useMap = (initialMap: MapTile[]) => {
  const [tiles, setTiles] = useState<MapTile[]>(initialMap);
  const getTileAt = useCallback(
    (x: number, z: number) => tiles.find((tile) => tile.position[0] === x && tile.position[2] === z),
    [tiles]
  );

  const isWalkable = useCallback(
    (x: number, z: number) => {
      const tile = getTileAt(x, z);
      return (
        tile &&
        tile.terrain !== 'water' &&
        tile.object &&
        tile.object !== 'barn' &&
        tile.object !== 'bank' &&
        tile.object !== 'rock' &&
        tile.object !== 'tree' &&
        tile.object !== 'leaderboard'
      );
    },
    [getTileAt]
  );

  const updateTile = (id: string, changes: Partial<MapTile>) => {
    setTiles((prev) => prev.map((tile) => (tile.id === id ? { ...tile, ...changes } : tile)));
  };

  return { tiles, getTileAt, isWalkable, updateTile };
};
