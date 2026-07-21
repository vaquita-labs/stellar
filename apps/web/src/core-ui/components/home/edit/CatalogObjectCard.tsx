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
import { MapClockCard } from '../MapClock';
import { isHudItem } from './hudItems';
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

  // Los ítems de HUD no tienen modelo 3D: el preview es la propia card que
  // desbloquean, en 2D sobre la escena.
  const hud = isHudItem(type);

  const previewObject = useMemo(
    () => (hud ? null : getObjectGroup({ type, position: [0, 0, 0], variant, rotation: [0, 0, 0] }, WorldType.FOREST)),
    [hud, type, variant]
  );
  useEffect(() => {
    if (!previewObject) return;
    return () => disposeObject(previewObject);
  }, [previewObject]);

  return (
    <group position={position} onClick={onClick}>
      {previewObject ? (
        <group ref={rotatingRef} position={[0, 0.55, 0]}>
          <primitive object={previewObject} />
        </group>
      ) : (
        <Html position={[0, 0.55, 0]} center transform={false}>
          {/* Ancho fijo como el de la etiqueta de abajo: sin él la card queda a
              merced del ancho que le da el Canvas y la hora se parte en dos líneas. */}
          <button type="button" onClick={onClick} className="pointer-events-auto flex justify-center" style={{ width: 110 }}>
            <MapClockCard label={t('home.catalog.clockPreviewHour', '8 pm')} solid />
          </button>
        </Html>
      )}

      {/* Nombre + precio en la misma píldora. El nombre trunca si no entra; el
          precio nunca (shrink-0), que es el dato que se compara entre cards. */}
      <Html position={[0, -1.5, 0]} center transform={false}>
        <button
          type="button"
          onClick={onClick}
          className={`pointer-events-auto ${!affordable ? 'opacity-60' : ''}`}
          style={{ width: 124 }}
        >
          <div className="flex items-center justify-between gap-1.5 bg-white/90 rounded-full px-2.5 py-0.5 border border-black/10">
            <span className="text-xs font-bold text-black truncate">{getMapItemName(t, type, variant)}</span>
            <span className="flex shrink-0 items-center gap-0.5">
              <Image
                src="/icons/global/coin.png"
                alt={t('home.catalog.goldAlt', 'Gold')}
                width={12}
                height={12}
                className="object-contain"
              />
              <span className="text-xs font-bold text-black">{price}</span>
            </span>
          </div>
        </button>
      </Html>
    </group>
  );
}
