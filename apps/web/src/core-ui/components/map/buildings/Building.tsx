'use client';

import { useFont } from '@/core-ui/hooks/useFont';
import { MapObjectType } from '@/core-ui/types';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { disposeObject } from '../helpers';
import { mergeStaticGroup } from '../tiles/staticWorld';
import { BUILDING_WORLD, BuildingDefinition, composeBuildingRotation } from './registry';

interface BuildingProps {
  type: MapObjectType;
  definition: BuildingDefinition;
  position: [number, number, number];
  rotation?: [number, number, number];
  onClick?: () => void;
}

// Render genérico de un edificio en modo normal: construye la geometría del
// registro, aplica la rotación compuesta y agrega interactividad (cursor +
// click) solo si tiene handler. Los detalles por edificio viven en registry.tsx.
export function Building({ type, definition, position, rotation: userRotation, onClick }: BuildingProps) {
  const { gl } = useThree();
  const font = useFont();

  // El edificio es estático en modo normal: se fusionan sus decenas de cajas
  // en un mesh por material (menos draw calls). El click sigue funcionando
  // porque el handler vive en el <group> contenedor.
  const object = useMemo(
    () =>
      mergeStaticGroup(
        definition.build({ position, type, variant: 0, rotation: [0, 0, 0] }, { worldType: BUILDING_WORLD, font })
      ),
    [definition, position, type, font]
  );

  useEffect(() => {
    return () => disposeObject(object);
  }, [object]);

  const rotation = composeBuildingRotation(type, userRotation);
  const Extras = definition.Extras;

  return (
    <group
      position={position}
      rotation={rotation}
      onPointerEnter={
        onClick
          ? (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              gl.domElement.style.cursor = 'pointer';
            }
          : undefined
      }
      onPointerLeave={
        onClick
          ? (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              gl.domElement.style.cursor = 'default';
            }
          : undefined
      }
      onClick={
        onClick
          ? (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      <primitive object={object} />
      {Extras && <Extras />}
    </group>
  );
}
