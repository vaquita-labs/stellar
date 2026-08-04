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
  /** Tipos de los tiles vecinos: el terreno bajo el edificio necesita saber
   *  qué lados están expuestos para dibujar el contorno de costa. */
  neighborTypeAt?: (x: number, z: number) => MapObjectType | undefined;
  onClick?: () => void;
}

// Render genérico de un edificio en modo normal: construye la geometría del
// registro, aplica la rotación compuesta y agrega interactividad (cursor +
// click) solo si tiene handler. Los detalles por edificio viven en registry.tsx.
export function Building({
  type,
  definition,
  position,
  rotation: userRotation,
  neighborTypeAt,
  onClick,
}: BuildingProps) {
  const { gl } = useThree();
  const font = useFont();

  // La rotación del usuario va al <group> de afuera, pero el builder también la
  // necesita: el tile de pasto de abajo se contra-rota con ella para que su
  // contorno siga alineado con la grilla (ver withGrassTerrain).
  const rotationKey = (userRotation ?? [0, 0, 0]).join(',');

  // El edificio es estático en modo normal: se fusionan sus decenas de cajas
  // en un mesh por material (menos draw calls). El click sigue funcionando
  // porque el handler vive en el <group> contenedor.
  const object = useMemo(
    () =>
      mergeStaticGroup(
        definition.build(
          {
            position,
            type,
            variant: 0,
            rotation: rotationKey.split(',').map(Number) as [number, number, number],
          },
          // animated: el render normal anima partes con R3F (aspas del molino),
          // así el builder las omite de la geometría fusionada (Extras las pone).
          { worldType: BUILDING_WORLD, font, tileXZ: [position[0], position[2]], neighborTypeAt, animated: true }
        )
      ),
    [definition, position, type, font, rotationKey, neighborTypeAt]
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
