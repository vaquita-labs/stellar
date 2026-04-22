'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMapStore } from '../../stores';
import { useRef } from 'react';
import * as THREE from 'three';

// Este componente calcula las 4 esquinas del tile en perspectiva isométrica
export const TileSpotlightUpdater = () => {
  const editingObjectPosition = useMapStore((store) => store.editingObjectPosition);
  const setTileCorners = useMapStore((store) => store.setTileCorners);
  const { camera, gl } = useThree();
  const frameCountRef = useRef(0);
  const lastCornersRef = useRef<{ x: number; y: number }[] | null>(null);

  useFrame(() => {
    // Throttle: solo actualizar cada 5 frames para reducir carga
    frameCountRef.current++;
    if (frameCountRef.current % 5 !== 0) {
      return;
    }

    if (!editingObjectPosition) {
      if (lastCornersRef.current !== null) {
        setTileCorners(null);
        lastCornersRef.current = null;
      }
      return;
    }

    const [x, y, z] = editingObjectPosition;
    const tileSize = 1; // TILE_SIZE = 1
    
    // Calcular las 4 esquinas del tile en el mundo 3D
    const corners3D = [
      new THREE.Vector3(x - tileSize / 2, y, z - tileSize / 2), // Esquina inferior izquierda
      new THREE.Vector3(x + tileSize / 2, y, z - tileSize / 2), // Esquina inferior derecha
      new THREE.Vector3(x + tileSize / 2, y, z + tileSize / 2), // Esquina superior derecha
      new THREE.Vector3(x - tileSize / 2, y, z + tileSize / 2), // Esquina superior izquierda
    ];

    // Proyectar cada esquina a coordenadas de pantalla
    const corners2D = corners3D.map((corner) => {
      const vector = corner.clone();
      vector.project(camera);
      
      const rect = gl.domElement.getBoundingClientRect();
      const screenX = ((vector.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((1 - vector.y) / 2) * rect.height + rect.top;
      
      return { x: screenX, y: screenY };
    });

    // Solo actualizar si las esquinas cambiaron significativamente
    if (!lastCornersRef.current) {
      setTileCorners(corners2D);
      lastCornersRef.current = corners2D;
      return;
    }

    let hasChanged = false;
    for (let i = 0; i < corners2D.length; i++) {
      const diffX = Math.abs(lastCornersRef.current[i].x - corners2D[i].x);
      const diffY = Math.abs(lastCornersRef.current[i].y - corners2D[i].y);
      if (diffX > 5 || diffY > 5) {
        hasChanged = true;
        break;
      }
    }

    if (hasChanged) {
      setTileCorners(corners2D);
      lastCornersRef.current = corners2D;
    }
  });

  return null;
};
