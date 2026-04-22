'use client';

import { ObjectListObjectCard } from '@/core-ui/components/home/edit/ObjectListObjectCard';
import { SceneLighting } from '@/core-ui/components/templates/WorldMap/map/SceneLighting';
import { useIsMobile, useProfileMapObjectsAvailable } from '@/core-ui/hooks';
import { EditionMode, ObjectItem, useMapStore } from '@/core-ui/stores';
import { Canvas } from '@react-three/fiber';
import { memo, useEffect, useMemo } from 'react';

function ObjectListCmp() {
  const isMobile = useIsMobile();
  const { data } = useProfileMapObjectsAvailable();
  const currentTiles = useMapStore((store) => store.currentTiles);
  const setEditMode = useMapStore((store) => store.setEditMode);
  const setPickedItem = useMapStore((store) => store.setPickedItem);
  const pickedObject = useMapStore((store) => store.pickedObject);
  const objects = useMemo(
    () =>
      (data?.objects || []).map((obj) => ({
        ...obj,
        used: currentTiles.reduce((sum, tile) => sum + +(tile.type === obj.type && tile.variant === obj.variant), 0),
      })),
    [currentTiles, data?.objects]
  );

  const objectPickedObject = objects.find(
    (obj) => obj.type === pickedObject?.type && obj.variant === pickedObject?.variant
  );

  useEffect(() => {
    if (objectPickedObject && objectPickedObject?.used >= objectPickedObject?.itemsAvailable) {
      setPickedItem(null);
      setEditMode(EditionMode.SELECT);
    }
  }, [objectPickedObject, setEditMode, setPickedItem]);
  const onItemClick = (item: ObjectItem) => {
    if (item.used < item.itemsAvailable) {
      setPickedItem(item);
      setEditMode(EditionMode.ADD);
    } else {
      console.info('Purchase item:', item);
    }
  };

  const spacing = 2;
  const totalWidth = (objects.length - 1) * spacing;
  const startX = -totalWidth / 2;
  const canvasWidth = Math.max((objects?.length || 0) * (isMobile ? 80 : 120), 320);

  return (
    <div className="h-[140px] sm:h-[220px] pb-2" style={{ width: canvasWidth }}>
      <Canvas shadows orthographic camera={{ position: [0, 10, 10], zoom: isMobile ? 40 : 60, near: 0.1, far: 1000 }}>
        <SceneLighting />
        <group>
          {objects.map(({ price, type, variant, itemsAvailable, used }, index) => (
            <ObjectListObjectCard
              key={`${type}-${variant}-${index}`}
              price={price}
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
  );
}

export const ObjectList = memo(ObjectListCmp);
