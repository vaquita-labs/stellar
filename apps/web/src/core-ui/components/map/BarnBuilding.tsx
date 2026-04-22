'use client';

import { getBarnGroup } from '@/core-ui/components/map/objects';
import { MapObjectType, WorldType } from '@/core-ui/types';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

interface BarnBuildingProps {
  position: [number, number, number];
  onClick?: () => void;
  hasWallet?: boolean;
  rotation?: [number, number, number];
}

export default function BarnBuilding({ position, onClick, rotation = [0, 4.7, 0] }: BarnBuildingProps) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  const barnBuilding = useMemo(
    () =>
      getBarnGroup({ position, type: MapObjectType.LEADERBOARD, variant: 0, rotation: [0, 0, 0] }, WorldType.FOREST),
    [position]
  );

  return (
    <group
      ref={groupRef}
      position={position}
      // rotation is 4.7 because the barn is in the ground and 0 generated a awful visual effect
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
