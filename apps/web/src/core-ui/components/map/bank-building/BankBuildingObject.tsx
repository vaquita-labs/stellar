'use client';

import { getBankGroup } from '@/core-ui/components/map/objects';
import { useFont } from '@/core-ui/hooks/useFont';
import { MapObject, MapObjectType, WorldType } from '@/core-ui/types';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import Coin from '../../templates/WorldMap/map/Coin';

interface BankBuildingProps {
  position: [number, number, number];
  onClick?: () => void;
  goldCoinsToCollect: number;
  isLoading: boolean;
}

export default function BankBuildingObject({ position, onClick, goldCoinsToCollect, isLoading }: BankBuildingProps) {
  const { gl } = useThree();
  // baseY is 0.01 because the bank is in the ground and 0 generated a awful visual effect
  const baseY = 0.01;
  const font = useFont();
  const groupRef = useRef<THREE.Group>(null);

  const bankBuilding = useMemo(() => {
    return getBankGroup(
      { position, type: MapObjectType.BANK, variant: 0, rotation: [0, 0, 0] },
      WorldType.FOREST,
      font
    );
  }, [font, position]);

  // Calcular la posición de la moneda encima del banco
  const coinPosition: [number, number, number] = useMemo(() => {
    // Altura del techo + offset para que esté bien visible
    const roofTopY = baseY + 0.16 + 0.3 + 0.1 + 0.06 + 0.06 + 0.3 + 0.6;
    // La posición relativa al grupo del banco (centro arriba)
    return [0, roofTopY, 0];
  }, [baseY]);

  const rotation: MapObject['rotation'] = [0, Math.PI, 0];

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
      <primitive object={bankBuilding} />
      {goldCoinsToCollect > 0 && (
        <Coin position={coinPosition} size={0.25} counter={goldCoinsToCollect} isLoading={isLoading} />
      )}
    </group>
  );
}
