'use client';

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Group } from 'three';
import { EditionMode, useMapStore } from '../../../stores';
import { MapObjectType, WorldType } from '../../../types';
import { getObjectGroup } from '../../map/helpers';

type ObjectListObjectCardProps = {
  used: number;
  itemsAvailable: number;
  type: MapObjectType;
  variant: number;
  position: [number, number, number];
  onClick: () => void;
};

export function ObjectListObjectCard({
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
  const remaining = Math.max(itemsAvailable - used, 0);
  const isAvailable = remaining > 0;

  return (
    <group position={position} onClick={onClick}>
      <group ref={rotatingRef} position={[0, 0.55, 0]} scale={isSelected ? 1.1 : 1}>
        <primitive
          object={getObjectGroup(
            { type, position: [0, 0, 0], variant, rotation: [0, 0, 0] },
            WorldType.FOREST
          )}
        />
      </group>

      {/* Top-right count badge */}
      {remaining > 0 && (
        <Html position={[0.65, 1.3, 0]} center transform={false}>
          <span className="text-[10px] font-bold bg-[#34c759] text-white border border-black/10 rounded-full min-w-5 h-5 px-1.5 inline-flex items-center justify-center pointer-events-none whitespace-nowrap">
            {remaining}
          </span>
        </Html>
      )}

      {/* Footer: name only */}
      <Html position={[0, -1.5, 0]} center transform={false}>
        <div
          className={`pointer-events-none ${!isAvailable ? 'opacity-60' : ''}`}
          style={{ width: 110 }}
        >
          <div
            className="text-xs font-bold text-black truncate max-w-full text-center bg-white/90 rounded-full px-2 py-0.5 border border-black/10"
            style={{ textWrap: 'nowrap' }}
          >
            {type} <span className="text-gray-500 font-normal">v{variant + 1}</span>
          </div>
        </div>
      </Html>
    </group>
  );
}
