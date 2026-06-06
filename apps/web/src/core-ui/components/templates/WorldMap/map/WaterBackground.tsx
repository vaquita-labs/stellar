'use client';

import { TILE_HEIGHT } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { WorldType } from '@/core-ui/types';
import { useMemo } from 'react';
import * as THREE from 'three';

// Azul de agua más saturado y distinto del cielo para que se note el "sobre agua".
const waterColors = {
  [WorldType.FOREST]: '#2FA7DE',
  [WorldType.DESERT]: '#2E8FD6',
  [WorldType.VOLCANO]: '#E0791A',
};

interface WaterBackgroundProps {
  worldType?: WorldType;
}

export const WaterBackground = ({ worldType = WorldType.FOREST }: WaterBackgroundProps) => {
  const waterMesh = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1000, 1000, 2, 1);
    const material = new THREE.MeshLambertMaterial({
      color: waterColors[worldType] || waterColors[WorldType.FOREST],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2; // plano horizontal
    mesh.receiveShadow = true; // recibe la sombra que proyecta la isla
    // Nivel del agua justo por debajo de la cara superior de los tiles (top en y=0),
    // dejando ver el pasto arriba y la tierra de los lados antes de tocar el agua.
    mesh.position.y = -TILE_HEIGHT * 0.85;

    return mesh;
  }, [worldType]);

  return <primitive object={waterMesh} />;
};
