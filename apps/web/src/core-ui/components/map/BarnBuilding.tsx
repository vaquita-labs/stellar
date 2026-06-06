'use client';

import { getBarnGroup } from '@/core-ui/components/map/objects';
import { MapObjectType, WorldType } from '@/core-ui/types';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { composeBuildingRotation } from './buildingRotations';

interface BarnBuildingProps {
  position: [number, number, number];
  onClick?: () => void;
  hasWallet?: boolean;
  rotation?: [number, number, number];
}

export default function BarnBuilding({ position, onClick, rotation: userRotation }: BarnBuildingProps) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  const barnBuilding = useMemo(
    () =>
      getBarnGroup({ position, type: MapObjectType.LEADERBOARD, variant: 0, rotation: [0, 0, 0] }, WorldType.FOREST),
    [position]
  );

  // Orientación base del granero (4.7) + giro del usuario, para que coincida con el modo edición.
  const rotation = composeBuildingRotation(MapObjectType.BARN, userRotation);

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      onPointerEnter={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        gl.domElement.style.cursor = 'pointer';
      }}
      onPointerLeave={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        gl.domElement.style.cursor = 'default';
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <primitive object={barnBuilding} />
    </group>
  );
}
