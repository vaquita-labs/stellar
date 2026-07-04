'use client';

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import Image from 'next/image';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Group } from 'three';
import { MapObjectType, WorldType } from '../../../types';
import { disposeObject } from '../../map/helpers';
import { getObjectGroup } from '../../map/tiles/registry';
import { getMapItemName } from './mapItemNames';

type CatalogObjectCardProps = {
  type: MapObjectType;
  variant: number;
  price: number;
  affordable: boolean;
  position: [number, number, number];
  onClick: () => void;
};

/** Card 3D de un ítem del catálogo: preview girando + precio. */
export function CatalogObjectCard({ type, variant, price, affordable, position, onClick }: CatalogObjectCardProps) {
  const { t } = useTranslation();
  const rotatingRef = useRef<Group>(null);

  useFrame(() => {
    if (rotatingRef.current) {
      rotatingRef.current.rotation.y += 0.01;
    }
  });

  const previewObject = useMemo(
    () => getObjectGroup({ type, position: [0, 0, 0], variant, rotation: [0, 0, 0] }, WorldType.FOREST),
    [type, variant]
  );
  useEffect(() => {
    return () => disposeObject(previewObject);
  }, [previewObject]);

  return (
    <group position={position} onClick={onClick}>
      <group ref={rotatingRef} position={[0, 0.55, 0]}>
        <primitive object={previewObject} />
      </group>

      {/* Nombre + precio */}
      <Html position={[0, -1.5, 0]} center transform={false}>
        <button
          type="button"
          onClick={onClick}
          className={`pointer-events-auto ${!affordable ? 'opacity-60' : ''}`}
          style={{ width: 110 }}
        >
          <div className="text-xs font-bold text-black truncate max-w-full text-center bg-white/90 rounded-full px-2 py-0.5 border border-black/10">
            {getMapItemName(t, type, variant)}
          </div>
          <div className="mt-1 flex items-center justify-center gap-1">
            <Image src="/icons/global/coin.png" alt={t('home.catalog.goldAlt', 'Gold')} width={14} height={14} className="object-contain" />
            <span className="text-xs font-bold text-black">{price}</span>
          </div>
        </button>
      </Html>
    </group>
  );
}
