import { useProfileMapObjects } from '@/core-ui/hooks/profile/useProfileMapObjects';
import { MapObject, MapObjectType, ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import { useEffect } from 'react';
import { create } from 'zustand';

export type ObjectItem = {
  type: MapObjectType;
  variant: number;
  used: number;
  itemsAvailable: number;
};

export enum EditionMode {
  SELECT = 'select',
  ADD = 'add',
  REMOVE = 'remove',
}

export type MapStoreType = {
  tiles: ProfileMapObjectsResponseDTO['objects'];
  currentTiles: ProfileMapObjectsResponseDTO['objects'];
  setTiles: (tiles: ProfileMapObjectsResponseDTO['objects']) => void;
  getTileAt: (x: number, z: number) => MapObject | undefined;
  isWalkable: (x: number, z: number) => boolean;
  updateTile: (position: [number, number, number], changes: MapObject) => void;
  isReplaceablePosition: (x: number, z: number) => boolean;
  editMode: EditionMode | null;
  setEditMode: (editMode: EditionMode | null) => void;
  isEditingMap: boolean;
  setIsEditingMap: (isEditingMap: boolean) => void;
  pickedObject: ObjectItem | null;
  setPickedItem: (item: ObjectItem | null) => void;
  selectedObject: ObjectItem | null;
  setSelectedObject: (item: ObjectItem | null) => void;
  editingObjectPosition: [number, number, number] | null;
  setEditingObjectPosition: (position: [number, number, number] | null) => void;
  screenPosition: { x: number; y: number } | null;
  setScreenPosition: (position: { x: number; y: number } | null) => void;
  tileCorners: { x: number; y: number }[] | null;
  setTileCorners: (corners: { x: number; y: number }[] | null) => void;
};

export const useMapStore = create<MapStoreType>((set, get) => ({
  tiles: [],
  currentTiles: [],
  setTiles: (tiles) => set({ tiles, currentTiles: tiles }),
  getTileAt: (x, z) => {
    return get().currentTiles.find((t) => t.position[0] === x && t.position[2] === z);
  },
  isWalkable: (x, z) => {
    const tile = get().getTileAt(x, z);
    return tile?.type === MapObjectType.BUSH || tile?.type === MapObjectType.GRASS;
  },
  updateTile: (position, changes) => {
    set((state) => {
      const existingTileIndex = state.currentTiles.findIndex(
        (tile) => tile.position[0] === position[0] && tile.position[2] === position[2]
      );

      if (existingTileIndex !== -1) {
        // Actualizar tile existente
        const newTiles = state.currentTiles.map((tile) => {
          if (tile.position[0] === position[0] && tile.position[2] === position[2]) {
            // Crear un nuevo objeto con todos los cambios, asegurando que rotation sea un nuevo array
            const updatedTile = { ...tile, ...changes };
            if (changes.rotation && Array.isArray(changes.rotation)) {
              updatedTile.rotation = [...changes.rotation] as [number, number, number];
            }
            return updatedTile;
          }
          return tile;
        });
        return { currentTiles: newTiles };
      } else {
        // Crear nuevo tile si no existe
        const newTile: MapObject = {
          position,
          type: changes.type,
          variant: changes.variant ?? 0,
          rotation: (changes.rotation && Array.isArray(changes.rotation) ? [...changes.rotation] : [0, 0, 0]) as [
            number,
            number,
            number,
          ],
        };
        return { currentTiles: [...state.currentTiles, newTile] };
      }
    });
  },
  isReplaceablePosition: (x, z) => {
    const tile = get().getTileAt(x, z);
    // Si no hay tile, es un espacio vacío y se puede rellenar
    if (!tile) return true;
    // Si el tile es EMPTY o GRASS, se puede reemplazar
    return tile.type === MapObjectType.EMPTY || tile.type === MapObjectType.GRASS;
  },
  editMode: null,
  setEditMode: (editMode) => set({ editMode }),
  isEditingMap: false,
  setIsEditingMap: (isEditingMap) => set({ isEditingMap }),
  pickedObject: null,
  setPickedItem: (item) => set({ pickedObject: item }),
  selectedObject: null,
  setSelectedObject: (item) => set({ selectedObject: item }),
  editingObjectPosition: null,
  setEditingObjectPosition: (position) => set({ editingObjectPosition: position }),
  screenPosition: null,
  setScreenPosition: (position) => set({ screenPosition: position }),
  tileCorners: null,
  setTileCorners: (corners) => set({ tileCorners: corners }),
}));

export const useSyncMapObjects = () => {
  const { data, refetch } = useProfileMapObjects();
  const setTiles = useMapStore((s) => s.setTiles);

  const objectsString = JSON.stringify(data?.objects || []);

  useEffect(() => {
    setTiles(JSON.parse(objectsString));
  }, [objectsString, setTiles]);

  return { refetch };
};
