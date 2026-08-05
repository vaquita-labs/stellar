import { useProfileMapObjectsByWallet } from '@/core-ui/hooks/profile/useProfileMapObjectsByWallet';
import { MapObject, MapObjectType, ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useConfigStore } from './config';

export type ObjectItem = {
  type: MapObjectType;
  variant: number;
  used: number;
  itemsAvailable: number;
};

/**
 * Tipos de tile sobre los que la vaquita puede pararse/caminar. Un mapa sin
 * ninguno de estos no tiene suelo: ahí la vaquita directamente no se muestra
 * (WorldMap) en vez de quedar flotando sobre el agua.
 */
export const isWalkableType = (type?: MapObjectType): boolean =>
  type === MapObjectType.BUSH || type === MapObjectType.GRASS || type === MapObjectType.ROAD;

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
  /** ¿Hay al menos un tile pisable en todo el mapa? */
  hasWalkableTile: () => boolean;
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
  /**
   * Colocación pendiente de confirmar (modo ADD): guarda qué había en la celda
   * antes de colocar, para poder revertirla si se cancela sin confirmar.
   * `previous: null` = la celda no tenía entrada (expansión).
   */
  pendingPlacement: { position: [number, number, number]; previous: MapObject | null } | null;
  setPendingPlacement: (pending: { position: [number, number, number]; previous: MapObject | null } | null) => void;
  revertPendingPlacement: () => void;
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
  isWalkable: (x, z) => isWalkableType(get().getTileAt(x, z)?.type),
  hasWalkableTile: () => get().currentTiles.some((tile) => isWalkableType(tile.type)),
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
    // Solo una celda vacía acepta un objeto. Sobre cualquier tile ya colocado
    // — pasto incluido — primero hay que quitarlo: así el pasto se comporta
    // como el resto de los ítems y su unidad vuelve a la colección al sacarlo,
    // en vez de que colocar encima lo pise en silencio.
    return tile.type === MapObjectType.EMPTY;
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
  pendingPlacement: null,
  setPendingPlacement: (pending) => set({ pendingPlacement: pending }),
  revertPendingPlacement: () => {
    set((state) => {
      const pending = state.pendingPlacement;
      if (!pending) return {};
      const [x, , z] = pending.position;
      const withoutCell = state.currentTiles.filter((tile) => tile.position[0] !== x || tile.position[2] !== z);
      return {
        currentTiles: pending.previous ? [...withoutCell, pending.previous] : withoutCell,
        pendingPlacement: null,
      };
    });
  },
  screenPosition: null,
  setScreenPosition: (position) => set({ screenPosition: position }),
  tileCorners: null,
  setTileCorners: (corners) => set({ tileCorners: corners }),
}));

/**
 * Sincroniza el store del mapa con los tiles de un perfil. Sin argumento usa
 * el usuario logueado; con `walletAddress` carga el mapa de OTRO perfil (vista
 * de leaderboard) — la vaquita y el render usan el mismo store en ambos casos.
 */
export const useSyncMapObjects = (walletAddress?: string) => {
  const ownWalletAddress = useConfigStore((s) => s.walletAddress);
  const { data, refetch } = useProfileMapObjectsByWallet(walletAddress || ownWalletAddress);
  const setTiles = useMapStore((s) => s.setTiles);

  const objectsString = JSON.stringify(data?.objects || []);

  useEffect(() => {
    setTiles(JSON.parse(objectsString));
  }, [objectsString, setTiles]);

  // isLoaded distingue "el mapa está vacío" de "todavía no llegó el API":
  // con mapas que arrancan vacíos, currentTiles.length ya no sirve para eso.
  return { refetch, isLoaded: data !== undefined };
};
