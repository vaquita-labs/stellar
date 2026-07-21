import { useFont } from '@/core-ui/hooks';
import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { EditionMode, useMapStore } from '@/core-ui/stores';
import { MapObject, MapObjectType } from '@/core-ui/types';
import { composeBuildingRotation, isBuildingType } from '../buildings/registry';
import { EditableObjectGroup } from '../edit/EditableObjectGroup';
import { EditControls } from '../edit/EditControls';
import { disposeObject, makeNeighborTypeLookup, objectSelectDown, objectSelectUp } from '../helpers';
import { buildTileObject, EDIT_ONLY_TYPES, getObjectGroup } from './registry';
import { buildStaticWorld, disposeStaticWorld } from './staticWorld';
import { GroundProps } from '../types';

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

        // Si hay un objeto existente en esta posición y no es reemplazable (GRASS/EMPTY), mostrar botones de edición
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
  const builtTiles = useMemo(() => {
    if (!hasEditMode) return [];
    const neighborTypeAt = makeNeighborTypeLookup(mapObjects);
    return mapObjects
      .map((mapObject) => {
        const { position } = mapObject;
        // El grupo se construye en el origen (la posición la aplica el
        // EditableObjectGroup que lo envuelve).
        const object = buildTileObject(
          { ...mapObject, position: [0, position[1], 0] },
          { worldType, font, tileXZ: [position[0], position[2]], neighborTypeAt }
        );
        return object ? { mapObject, object } : null;
      })
      .filter((entry): entry is { mapObject: MapObject; object: THREE.Object3D } => entry !== null);
  }, [mapObjects, worldType, hasEditMode, font]);

  // Liberar geometrías/materiales del set anterior cuando el mapa se
  // reconstruye o el componente se desmonta.
  useEffect(() => {
    const objects = builtTiles.map((entry) => entry.object);
    return () => {
      objects.forEach(disposeObject);
    };
  }, [builtTiles]);

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
      {builtTiles.map(({ mapObject, object }) => {
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
                    groundRef.current?.traverse((child) => {
                      objectSelectDown(child);
                    });
                    const root = e.eventObject as THREE.Object3D;
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
