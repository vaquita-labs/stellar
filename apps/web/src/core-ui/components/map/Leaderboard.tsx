'use client';

import { getLeaderboardGroup } from '@/core-ui/components/map/objects/leaderboard';
import { useFont } from '@/core-ui/hooks/useFont';
import { MapObjectType, WorldType } from '@/core-ui/types';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { composeBuildingRotation } from './buildingRotations';

interface LeaderBoardProps {
  position: [number, number, number];
  onClick?: () => void;
  rotation?: [number, number, number];
}

export default function Leaderboard({ position, onClick, rotation: userRotation }: LeaderBoardProps) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const font = useFont();

  const group = useMemo(() => {
    return getLeaderboardGroup(
      { position, type: MapObjectType.LEADERBOARD, variant: 0, rotation: [0, 0, 0] },
      WorldType.FOREST,
      font
    );
  }, [font, position]);

  const rotation = composeBuildingRotation(MapObjectType.LEADERBOARD, userRotation);

  return (
    <group
      ref={groupRef}
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
      <primitive object={group} />
    </group>
  );
}
