'use client';

import { TILE_HEIGHT } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { useMemo } from 'react';
import * as THREE from 'three';

export const WaterBackground = () => {
  const waterMesh = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1000, 1000, 2, 1);
    const material = new THREE.MeshLambertMaterial({
      color: '#6FF2F1',
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2; // horizontal plane
    mesh.position.y = -TILE_HEIGHT / 2 + 0.3;

    return mesh;
  }, []);

  return <primitive object={waterMesh} />;
};
