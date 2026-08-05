import { useFont } from '@/core-ui/hooks';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EditionMode, useMapStore } from '@/core-ui/stores';
import { MapObject, MapObjectType } from '@/core-ui/types';
import { composeBuildingRotation, isBuildingType } from '../buildings/registry';
import { EditableObjectGroup, TileHitbox } from '../edit/EditableObjectGroup';
import { EditControls } from '../edit/EditControls';
import { disposeObject, makeNeighborTypeLookup, objectSelectDown, objectSelectUp } from '../helpers';
import { buildTileObject, EDIT_ONLY_TYPES, getObjectGroup } from './registry';
import { buildStaticWorld, disposeStaticWorld } from './staticWorld';
import { GroundProps } from '../types';
import { WorldType } from '@/core-ui/types';

// Todo lo que afecta la GEOMETRÍA construida de un tile en modo edición.
// buildTileObject depende de: tipo/variante/rotación/altura del propio tile,
// el mundo, la fuente (leaderboard) y los tipos de los 8 vecinos inmediatos —
// las bandas de costa/camino miran radio 1 como máximo (recipe.ts, water.ts,
// road.ts). Si un builder nuevo mira más lejos, hay que extender esta clave.
const tileContentKey = (
  mapObject: MapObject,
  neighborTypeAt: (x: number, z: number) => MapObjectType | undefined,
  worldType: WorldType,
  fontLoaded: boolean
): string => {
  const [x, y, z] = mapObject.position;
  const rotation = mapObject.rotation ?? [0, 0, 0];
  const neighbors = [
    neighborTypeAt(x + 1, z),
    neighborTypeAt(x - 1, z),
    neighborTypeAt(x, z + 1),
    neighborTypeAt(x, z - 1),
    neighborTypeAt(x + 1, z + 1),
    neighborTypeAt(x + 1, z - 1),
    neighborTypeAt(x - 1, z + 1),
    neighborTypeAt(x - 1, z - 1),
  ];
  return `${mapObject.type}|${mapObject.variant}|${y}|${rotation.join(',')}|${worldType}|${fontLoaded ? 1 : 0}|${neighbors.join(',')}`;
};

interface TileCacheEntry {
  contentKey: string;
  object: THREE.Object3D;
  hitbox: TileHitbox;
}

// Los meshes visuales del tile no participan del raycast: el único blanco es
// el hitbox invisible de EditableObjectGroup. Sin esto, cada pointermove
// intersectaba TODOS los meshes y contornos del mapa (miles en un mapa lleno).
const noopRaycast = () => {};

// Caja de hit del tile: footprint fijo de la celda (1×1 en XZ, para que las
// copas/salientes no invadan celdas vecinas) y alto tomado del bounding box
// real del objeto construido — así clickear la torre del molino selecciona su
// tile, pero el aire sobre un pasto vacío deja pasar el rayo a lo que hay
// detrás (misma semántica de picking que con el raycast por mesh).
const computeTileHitbox = (object: THREE.Object3D): TileHitbox => {
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return { centerY: 0, height: 0.3 };
  const height = Math.max(bounds.max.y - bounds.min.y, 0.3);
  return { centerY: bounds.min.y + height / 2, height };
};

export const Ground = ({ mapObjects, worldType, onClickObject }: GroundProps) => {
  const editMode = useMapStore((store) => store.editMode);
  const { gl } = useThree();
  const isReplaceablePosition = useMapStore((store) => store.isReplaceablePosition);
  const pickedObject = useMapStore((store) => store.pickedObject);
  const updateTile = useMapStore((store) => store.updateTile);
  const setPendingPlacement = useMapStore((store) => store.setPendingPlacement);
  const setEditingObjectPosition = useMapStore((store) => store.setEditingObjectPosition);
  const editingObjectPosition = useMapStore((store) => store.editingObjectPosition);
  const groundRef = useRef<THREE.Group>(null);
  const pickedObjectGroupRef = useRef<THREE.Group>(null);
  // Último tile con highlight de hover: se apaga solo ESE al entrar a otro,
  // en vez de recorrer el mapa entero (groundRef.traverse) por cada hover.
  const hoveredTileRef = useRef<THREE.Object3D | null>(null);
  // Posición "x,z" del objeto recién colocado, para animar su entrada (saltito).
  // Se limpia después de cada render: solo el render que sigue a la colocación lo ve.
  const justPlacedKeyRef = useRef<string | null>(null);
  const font = useFont();

  useEffect(() => {
    justPlacedKeyRef.current = null;
  });

  const handlePlaceItem = useCallback(
    (position: [number, number, number], rotation: [number, number, number], mapObject?: MapObject) => {
      if (editMode === EditionMode.REMOVE) {
        updateTile(position, {
          variant: 0,
          type: MapObjectType.EMPTY,
          position,
          rotation,
        });
        setEditingObjectPosition(null);
        return;
      }
      if (editMode === EditionMode.ADD) {
        const [x, , z] = position;

        // Si hay un objeto en edición, NO permitir seleccionar otro hasta que se complete la acción
        if (editingObjectPosition) {
          const [editX, , editZ] = editingObjectPosition;
          // Solo permitir interactuar con el objeto que ya está en edición
          if (editX !== x || editZ !== z) {
            // Ignorar clicks en otros objetos mientras hay uno en edición
            return;
          }
        }

        // Si hay un tile colocado en esta posición (todo lo que no sea EMPTY),
        // mostrar sus botones de edición: primero se quita y recién ahí la
        // celda acepta otro objeto.
        if (mapObject && mapObject.type !== MapObjectType.EMPTY && !isReplaceablePosition(x, z)) {
          // Activar modo de edición para el objeto existente
          setEditingObjectPosition(position);
          return;
        }

        // Si no hay objeto seleccionado o la posición no es reemplazable, no hacer nada
        if (!pickedObject || !isReplaceablePosition(x, z)) {
          return;
        }

        // Guardar qué había en la celda: si se cancela sin confirmar, la
        // colocación se revierte (revertPendingPlacement).
        setPendingPlacement({ position, previous: useMapStore.getState().getTileAt(x, z) ?? null });
        updateTile(position, {
          variant: pickedObject.variant,
          type: pickedObject.type,
          position,
          rotation: rotation || [0, 0, 0],
        });
        justPlacedKeyRef.current = `${x},${z}`;

        // Activar modo de edición para mostrar los botones flotantes
        setEditingObjectPosition(position);
      } else if (editMode === EditionMode.SELECT && mapObject) {
        // Los tiles EMPTY son solo un plano invisible para poder clickear al
        // colocar en modo ADD: ahí no hay nada que editar/quitar/rotar.
        if (mapObject.type === MapObjectType.EMPTY) {
          return;
        }

        // Si hay un objeto en edición, NO permitir seleccionar otro hasta que se complete la acción
        if (editingObjectPosition) {
          const [editX, , editZ] = editingObjectPosition;
          const [x, , z] = position;
          // Solo permitir interactuar con el objeto que ya está en edición
          if (editX !== x || editZ !== z) {
            // Ignorar clicks en otros objetos mientras hay uno en edición
            return;
          }
        }

        // Cuando se hace clic en un objeto existente en modo SELECT, activar edición
        setEditingObjectPosition(position);
      }
    },
    [editMode, updateTile, pickedObject, isReplaceablePosition, setEditingObjectPosition, editingObjectPosition, setPendingPlacement]
  );
  const hasEditMode = !!editMode;

  // Construir los grupos de Three.js es caro (cada builder crea geometrías y
  // materiales nuevos). Se memoiza para que los re-renders del componente
  // (hover, posición de edición, etc.) no reconstruyan el mapa entero.
  // Modo normal: el terreno es 100% estático y sin interacción, así que se
  // renderiza como un conjunto de InstancedMesh (~10-20 draw calls en vez de
  // cientos). Al entrar en edición se reconstruye tile por tile (abajo).
  const staticWorld = useMemo(() => {
    if (hasEditMode) return null;
    return buildStaticWorld(mapObjects, worldType);
  }, [mapObjects, worldType, hasEditMode]);

  useEffect(() => {
    if (!staticWorld) return;
    return () => disposeStaticWorld(staticWorld);
  }, [staticWorld]);

  // Modo edición: cada tile es un grupo individual e interactivo.
  //
  // Cache por celda: construir un tile es caro (geometrías + materiales
  // nuevos) y `mapObjects` cambia de identidad con CADA edición — sin cache,
  // colocar un solo objeto reconstruía el mapa entero (196 tiles ≈ freeze
  // visible por colocación). Con la clave de contenido (tileContentKey) solo
  // se reconstruyen el tile tocado y los vecinos cuyo contorno depende de él.
  // useState (y no useRef) por la identidad estable SIN leer refs en render;
  // nunca se re-setea, la mutación del Map es interna al cache.
  const [tileCache] = useState(() => new Map<string, TileCacheEntry>());
  // Grupos reemplazados/quitados en el último render: el dispose se difiere a
  // después del commit (useEffect de abajo) para no liberar recursos de
  // objetos que todavía están montados en el árbol anterior.
  const [staleObjects] = useState<{ list: THREE.Object3D[] }>(() => ({ list: [] }));

  const builtTiles = useMemo(() => {
    const cache = tileCache;
    if (!hasEditMode) {
      cache.forEach((entry) => staleObjects.list.push(entry.object));
      cache.clear();
      return [];
    }
    const neighborTypeAt = makeNeighborTypeLookup(mapObjects);
    const seen = new Set<string>();
    const result: { mapObject: MapObject; object: THREE.Object3D; hitbox: TileHitbox }[] = [];
    for (const mapObject of mapObjects) {
      const { position } = mapObject;
      const posKey = `${position[0]},${position[2]}`;
      seen.add(posKey);
      const contentKey = tileContentKey(mapObject, neighborTypeAt, worldType, !!font);
      const cached = cache.get(posKey);
      if (cached && cached.contentKey === contentKey) {
        result.push({ mapObject, object: cached.object, hitbox: cached.hitbox });
        continue;
      }
      // El grupo se construye en el origen (la posición la aplica el
      // EditableObjectGroup que lo envuelve).
      const object = buildTileObject(
        { ...mapObject, position: [0, position[1], 0] },
        { worldType, font, tileXZ: [position[0], position[2]], neighborTypeAt }
      );
      if (cached) staleObjects.list.push(cached.object);
      if (object) {
        // El hitbox de EditableObjectGroup es el único blanco de raycast.
        object.traverse((child) => {
          child.raycast = noopRaycast;
        });
        const hitbox = computeTileHitbox(object);
        cache.set(posKey, { contentKey, object, hitbox });
        result.push({ mapObject, object, hitbox });
      } else {
        cache.delete(posKey);
      }
    }
    // Celdas que ya no existen en el mapa.
    cache.forEach((entry, posKey) => {
      if (!seen.has(posKey)) {
        staleObjects.list.push(entry.object);
        cache.delete(posKey);
      }
    });
    return result;
  }, [mapObjects, worldType, hasEditMode, font, tileCache, staleObjects]);

  // Liberar geometrías/materiales de los grupos reemplazados, ya con el
  // commit hecho (los tiles reusados NO pasan por acá: viven en el cache).
  useEffect(() => {
    if (staleObjects.list.length === 0) return;
    // splice(0): drena la lista in-place (misma identidad, sin reasignar).
    staleObjects.list.splice(0).forEach(disposeObject);
  });

  // Al desmontar, liberar todo lo vivo del cache (dispose es idempotente).
  useEffect(() => {
    return () => {
      tileCache.forEach((entry) => disposeObject(entry.object));
      tileCache.clear();
      staleObjects.list.splice(0).forEach(disposeObject);
    };
  }, [tileCache, staleObjects]);

  // Preview del objeto a colocar en modo ADD (sigue el puntero por ref).
  const pickedPreviewObject = useMemo(() => {
    if (!pickedObject || editMode !== EditionMode.ADD) return null;
    return getObjectGroup(
      {
        type: pickedObject.type,
        variant: pickedObject.variant,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
      worldType
    );
  }, [pickedObject, editMode, worldType]);

  useEffect(() => {
    if (!pickedPreviewObject) return;
    return () => disposeObject(pickedPreviewObject);
  }, [pickedPreviewObject]);

  return (
    <group name="ground" ref={groundRef}>
      {staticWorld && <primitive object={staticWorld} />}
      {builtTiles.map(({ mapObject, object, hitbox }) => {
        const { type, position, variant, rotation } = mapObject;

        const isEditing = !!(
          editingObjectPosition &&
          editingObjectPosition[0] === position[0] &&
          editingObjectPosition[2] === position[2]
        );

        // Si hay un objeto en edición y este NO es el objeto en edición, bloquear todas las interacciones
        const isBlocked = !!editingObjectPosition && !isEditing;

        // Asegurar que rotation sea un array válido
        const userRotation: [number, number, number] =
          rotation && Array.isArray(rotation) && rotation.length === 3
            ? [rotation[0] || 0, rotation[1] || 0, rotation[2] || 0]
            : [0, 0, 0];

        // Los edificios tienen una orientación base; el resto usa la rotación tal cual.
        // Así en edición miran igual que en el mapa normal (misma fuente de verdad).
        const currentRotation: [number, number, number] = isBuildingType(type)
          ? composeBuildingRotation(type, userRotation)
          : userRotation;

        // El key debe ser estable basado solo en posición, tipo y variant, NO en rotación
        // para evitar que React cree un nuevo componente cuando cambia la rotación
        return (
          <EditableObjectGroup
            key={`${position.join(',')}-${type}-${variant}`}
            position={position}
            rotation={currentRotation}
            isEditing={isEditing}
            hitbox={hitbox}
            spawnAnimation={justPlacedKeyRef.current === `${position[0]},${position[2]}`}
            // Los tiles de terreno emergen desde abajo: el pop los encoge y
            // expone paredes/líneas de costa vecinas durante la animación.
            spawnStyle={
              type === MapObjectType.GRASS || type === MapObjectType.WATER || type === MapObjectType.ROAD
                ? 'rise'
                : 'pop'
            }
            onClick={
              !!editMode && !isBlocked
                ? (e) => {
                    e.stopPropagation();
                    onClickObject?.(mapObject);
                    handlePlaceItem(position, mapObject.rotation || [0, 0, 0], mapObject);
                  }
                : undefined
            }
            onPointerEnter={
              !!editMode && !isBlocked && !isEditing
                ? (e) => {
                    e.stopPropagation();
                    const root = e.eventObject as THREE.Object3D;
                    // Apagar solo el highlight anterior (si quedó colgado por
                    // un pointerleave perdido), no recorrer el mapa entero.
                    const previous = hoveredTileRef.current;
                    if (previous && previous !== root) {
                      previous.traverse(objectSelectDown);
                    }
                    hoveredTileRef.current = root;
                    const isReplaceable = isReplaceablePosition(position[0], position[2]);
                    root.traverse((child) => {
                      objectSelectUp(
                        child,
                        editMode === EditionMode.REMOVE
                          ? '#ef4444'
                          : editMode === EditionMode.ADD
                            ? isReplaceable
                              ? '#22c55e'
                              : '#ef4444'
                            : '#22c55e'
                      );
                    });
                    gl.domElement.style.cursor =
                      editMode === EditionMode.REMOVE
                        ? 'crosshair'
                        : editMode === EditionMode.ADD
                          ? isReplaceable
                            ? 'copy'
                            : 'not-allowed'
                          : editMode === EditionMode.SELECT
                            ? type !== MapObjectType.EMPTY
                              ? 'pointer'
                              : 'default'
                            : 'default';
                    pickedObjectGroupRef.current?.position.set(position[0], position[1], position[2]);
                  }
                : isBlocked || isEditing
                  ? (e) => {
                      // Cuando hay un objeto en edición o este objeto está siendo editado, solo cambiar cursor
                      e.stopPropagation();
                      gl.domElement.style.cursor = isEditing ? 'default' : 'not-allowed';
                    }
                  : undefined
            }
            onPointerLeave={
              !!editMode && !isBlocked && !isEditing
                ? (e) => {
                    e.stopPropagation();
                    const root = e.eventObject as THREE.Object3D;
                    root.traverse(objectSelectDown);
                    if (hoveredTileRef.current === root) {
                      hoveredTileRef.current = null;
                    }
                  }
                : isBlocked || isEditing
                  ? (e) => {
                      e.stopPropagation();
                      gl.domElement.style.cursor = 'default';
                    }
                  : undefined
            }
          >
            <primitive object={object} />
          </EditableObjectGroup>
        );
      })}
      {pickedPreviewObject && !editingObjectPosition && (
        <group ref={pickedObjectGroupRef} rotation={[0, 0, 0]} position={[0, 0, 0]}>
          <primitive object={pickedPreviewObject} />
        </group>
      )}
      {editMode !== null && editingObjectPosition && <EditControls position={editingObjectPosition} />}
    </group>
  );
};
