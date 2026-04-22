import { useFont } from '@/core-ui/hooks';
import { useThree } from '@react-three/fiber';
import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import { EditionMode, useMapStore } from '../../stores';
import { MapObject, MapObjectType } from '../../types';
import { EditableObjectGroup } from './EditableObjectGroup';
import { EditControls } from './EditControls';
import { getObjectGroup, objectSelectDown, objectSelectUp } from './helpers';
import { getBankGroup, getBarnGroup, getBushGroup, getGrassGroup, getLeaderboardGroup } from './objects';
import { getRoadGroup, getRockGroup, getTreeGroup, getWaterGroup } from './objects/';
import { GroundProps } from './types';

export const Ground = ({ mapObjects, worldType, onClickObject }: GroundProps) => {
  const editMode = useMapStore((store) => store.editMode);
  const { gl } = useThree();
  const isReplaceablePosition = useMapStore((store) => store.isReplaceablePosition);
  const pickedObject = useMapStore((store) => store.pickedObject);
  const updateTile = useMapStore((store) => store.updateTile);
  const setEditingObjectPosition = useMapStore((store) => store.setEditingObjectPosition);
  const editingObjectPosition = useMapStore((store) => store.editingObjectPosition);
  const groundRef = useRef<THREE.Group>(null);
  const pickedObjectGroupRef = useRef<THREE.Group>(null);
  const font = useFont();

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

        updateTile(position, {
          variant: pickedObject.variant,
          type: pickedObject.type,
          position,
          rotation: rotation || [0, 0, 0],
        });

        // Activar modo de edición para mostrar los botones flotantes
        setEditingObjectPosition(position);
      } else if (editMode === EditionMode.SELECT && mapObject) {
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
    [editMode, updateTile, pickedObject, isReplaceablePosition, setEditingObjectPosition, editingObjectPosition]
  );
  return (
    <group name="ground" ref={groundRef}>
      {mapObjects.map((mapObject) => {
        const { type, position, variant, rotation } = mapObject;
        let object: THREE.Group | THREE.Object3D | null = null;
        if (type === MapObjectType.WATER) {
          object = getWaterGroup({ ...mapObject, position: [0, position[1], 0] }, worldType);
        } else if (type === MapObjectType.ROCK) {
          object = getRockGroup({ ...mapObject, position: [0, position[1], 0] }, worldType);
        } else if (type === MapObjectType.GRASS) {
          object = getGrassGroup({ ...mapObject, position: [0, position[1], 0] }, worldType);
        } else if (type === MapObjectType.BUSH) {
          object = getBushGroup({ ...mapObject, position: [0, position[1], 0] }, worldType);
        } else if (type === MapObjectType.TREE) {
          object = getTreeGroup({ ...mapObject, position: [0, position[1], 0] }, worldType);
        } else if (type === MapObjectType.ROAD) {
          object = getRoadGroup({ ...mapObject, position: [0, position[1], 0] }, worldType);
        } else if (type === MapObjectType.BANK && !!editMode) {
          object = getBankGroup({ ...mapObject, position: [0, position[1], 0] }, worldType, font);
        } else if (type === MapObjectType.LEADERBOARD && !!editMode) {
          object = getLeaderboardGroup({ ...mapObject, position: [0, position[1], 0] }, worldType, font);
        } else if (type === MapObjectType.BARN && !!editMode) {
          object = getBarnGroup({ ...mapObject, position: [0, position[1], 0] }, worldType);
        } else if (type === MapObjectType.EMPTY && !!editMode) {
          // Crear un plano invisible para que los espacios EMPTY sean clickeables en modo edición
          const planeGeometry = new THREE.PlaneGeometry(1, 1);
          const planeMaterial = new THREE.MeshBasicMaterial({
            visible: false,
            transparent: true,
            opacity: 0,
          });
          object = new THREE.Mesh(planeGeometry, planeMaterial);
          object.rotation.x = -Math.PI / 2;
          object.position.y = position[1];
        }

        if (!object) return null;

        const isEditing = !!(
          editingObjectPosition &&
          editingObjectPosition[0] === position[0] &&
          editingObjectPosition[2] === position[2]
        );

        // Si hay un objeto en edición y este NO es el objeto en edición, bloquear todas las interacciones
        const isBlocked = !!editingObjectPosition && !isEditing;

        // Asegurar que rotation sea un array válido
        const currentRotation: [number, number, number] =
          rotation && Array.isArray(rotation) && rotation.length === 3
            ? [rotation[0] || 0, rotation[1] || 0, rotation[2] || 0]
            : [0, 0, 0];

        // El key debe ser estable basado solo en posición, tipo y variant, NO en rotación
        // para evitar que React cree un nuevo componente cuando cambia la rotación
        return (
          <EditableObjectGroup
            key={`${position.join(',')}-${type}-${variant}`}
            position={position}
            rotation={currentRotation}
            isEditing={isEditing}
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
                            ? 'pointer'
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
      {pickedObject && editMode === EditionMode.ADD && !editingObjectPosition && (
        <group ref={pickedObjectGroupRef} rotation={[0, 0, 0]} position={[0, 0, 0]}>
          <primitive
            object={getObjectGroup(
              {
                type: pickedObject.type,
                variant: pickedObject.variant,
                position: [0, 0, 0],
                rotation: [0, 0, 0],
              },
              worldType
            )}
          />
        </group>
      )}
      {editingObjectPosition && <EditControls position={editingObjectPosition} />}
    </group>
  );
};
