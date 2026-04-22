'use client';

import { useMapStore } from '../../stores';

export const SpotlightLighting = () => {
  const editingObjectPosition = useMapStore((store) => store.editingObjectPosition);
  
  // Oscurecer el mapa cuando hay un elemento en edición
  const ambientIntensity = editingObjectPosition ? 0.3 : 0.8;
  const directionalIntensity = editingObjectPosition ? 0.4 : 1.2;

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight
        castShadow
        intensity={directionalIntensity}
        position={[3, 15, -15]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0001}
      />
      {/* Luces de foco eliminadas - ahora solo se cambia el color del objeto */}
    </>
  );
};
