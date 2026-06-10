'use client';

import { ObjectListObjectCard } from '@/core-ui/components/home/edit/ObjectListObjectCard';
import { SceneLighting } from '@/core-ui/components/templates/WorldMap/map/SceneLighting';
import { useIsMobile, useProfileMapObjectsAvailable } from '@/core-ui/hooks';
import { EditionMode, ObjectItem, useMapStore } from '@/core-ui/stores';
import { Canvas } from '@react-three/fiber';
import Image from 'next/image';
import { memo, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

function ObjectListCmp() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { data } = useProfileMapObjectsAvailable();
  const currentTiles = useMapStore((store) => store.currentTiles);
  const setEditMode = useMapStore((store) => store.setEditMode);
  const setPickedItem = useMapStore((store) => store.setPickedItem);
  const pickedObject = useMapStore((store) => store.pickedObject);

  const objects = useMemo(
    () =>
      (data?.objects || [])
        .map((obj) => ({
          ...obj,
          used: currentTiles.reduce((sum, tile) => sum + +(tile.type === obj.type && tile.variant === obj.variant), 0),
        }))
        // Hide items the user no longer has any of (placed all of them or never owned any)
        .filter((obj) => obj.itemsAvailable - obj.used > 0),
    [currentTiles, data?.objects]
  );

  const objectPickedObject = objects.find(
    (obj) => obj.type === pickedObject?.type && obj.variant === pickedObject?.variant
  );

  useEffect(() => {
    if (objectPickedObject && objectPickedObject.used >= objectPickedObject.itemsAvailable) {
      setPickedItem(null);
      setEditMode(EditionMode.SELECT);
    }
  }, [objectPickedObject, setEditMode, setPickedItem]);

  const onItemClick = (item: ObjectItem) => {
    if (item.used < item.itemsAvailable) {
      setPickedItem(item);
      setEditMode(EditionMode.ADD);
    }
  };

  if (objects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
        <Image src="/icons/summary/bag.png" alt={t('home.objectList.emptyAlt', 'Empty')} width={48} height={48} className="opacity-60" />
        <p className="text-sm text-gray-600">{t('home.objectList.empty', 'Your collection is empty.')}</p>
        <p className="text-xs text-gray-500">{t('home.objectList.emptyHint', 'Buy items from the catalog to start collecting!')}</p>
      </div>
    );
  }

  // Each card occupies `spacing` world units along X. The orthographic camera with `zoom`
  // makes 1 world unit = `zoom` pixels, so canvasWidth = N * spacing * zoom fits cards
  // edge-to-edge with no leading/trailing gap.
  const zoom = isMobile ? 50 : 60;
  const spacing = 2.5;
  const startX = -((objects.length - 1) * spacing) / 2;
  const canvasWidth = objects.length * spacing * zoom;

  return (
    <div className="h-[160px] sm:h-[180px] overflow-x-auto scrollbar-hide" style={{ width: '100%' }}>
      <div style={{ width: canvasWidth, height: '100%' }}>
        <Canvas
          shadows
          orthographic
          camera={{ position: [0, 10, 10], zoom, near: 0.1, far: 1000 }}
        >
          <SceneLighting />
          <group>
            {objects.map(({ type, variant, itemsAvailable, used }, index) => (
              <ObjectListObjectCard
                key={`${type}-${variant}-${index}`}
                type={type}
                variant={variant}
                itemsAvailable={itemsAvailable}
                position={[startX + index * spacing, 0, 0]}
                onClick={() => onItemClick({ type, variant, used, itemsAvailable })}
                used={used}
              />
            ))}
          </group>
        </Canvas>
      </div>
    </div>
  );
}

export const ObjectList = memo(ObjectListCmp);
