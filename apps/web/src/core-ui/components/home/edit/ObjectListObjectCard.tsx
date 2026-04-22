'use client';

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import Image from 'next/image';
import { useRef } from 'react';
import { Group } from 'three';
import { EditionMode, useMapStore } from '../../../stores';
import { MapObjectType, WorldType } from '../../../types';
import { getObjectGroup } from '../../map/helpers';

type ObjectListObjectCardProps = {
  price: number;
  used: number;
  itemsAvailable: number;
  type: MapObjectType;
  variant: number;
  position: [number, number, number];
  onClick: () => void;
};

export function ObjectListObjectCard({
  price,
  itemsAvailable,
  type,
  variant,
  position,
  onClick,
  used,
}: ObjectListObjectCardProps) {
  const rotatingRef = useRef<Group>(null);
  const selectedItem = useMapStore((store) => store.pickedObject);
  const editMode = useMapStore((store) => store.editMode);
  useFrame(() => {
    if (rotatingRef.current) {
      rotatingRef.current.rotation.y += 0.01;
    }
  });

  const isSelected = editMode === EditionMode.ADD && selectedItem?.type === type && selectedItem?.variant === variant;
  const isAvailable = itemsAvailable > used;
  return (
    <group position={position} onClick={onClick}>
      <mesh position={[0, -2, -2]}>
        <planeGeometry args={[1.6, 4]} />
        <meshStandardMaterial
          color={isSelected ? '#34c759' : isAvailable ? '#80F79A' : '#ffffff'}
          emissive={isSelected ? '#34c759' : isAvailable ? '#80F79A' : '#ffffff'}
          emissiveIntensity={0.4}
        />
      </mesh>

      <group ref={rotatingRef} position={[0, 0.2, 0]}>
        <primitive
          object={getObjectGroup(
            {
              type,
              position: [0, 0, 0],
              variant,
              rotation: [0, 0, 0],
            },
            WorldType.FOREST
          )}
        />
      </group>

      <Html position={[0, -0.7, 0]} center>
        <div className="flex flex-col items-center gap-1" onClick={onClick}>
          <div className="text-[12px] bg-black/80 text-white px-2 py-0.5 rounded-full" style={{ textWrap: 'nowrap' }}>
            {type} (v{variant + 1})
          </div>
          <div className="text-[10px] bg-primary text-white px-2 py-0.5 rounded-full" style={{ textWrap: 'nowrap' }}>
            {used} / {itemsAvailable}
          </div>
          <div className="flex items-center gap-1 bg-white/80 px-2 py-0.5 rounded">
            <Image src="/icons/summary/silver_coin.png" alt="Silver Coin" width={12} height={12} />
            <span className="text-[10px] font-medium text-gray-700">{price}</span>
          </div>
        </div>
      </Html>
    </group>
  );
}
