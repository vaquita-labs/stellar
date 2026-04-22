'use client';

import { getLeaderboardGroup } from '@/core-ui/components/map/objects/leaderboard';
import { useFont } from '@/core-ui/hooks/useFont';
import { MapObjectType, WorldType } from '@/core-ui/types';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

interface LeaderBoardProps {
  position: [number, number, number];
  onClick?: () => void;
  rotation?: [number, number, number];
}

export default function Leaderboard({ position, onClick }: LeaderBoardProps) {
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

  return (
    <group
      ref={groupRef}
      position={position}
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
      <primitive object={group} />
    </group>
  );
}
