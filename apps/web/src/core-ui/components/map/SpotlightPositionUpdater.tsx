'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMapStore } from '../../stores';
import { useRef } from 'react';
import * as THREE from 'three';

// Este componente actualiza la posición en pantalla del objeto en edición
export const SpotlightPositionUpdater = () => {
  const editingObjectPosition = useMapStore((store) => store.editingObjectPosition);
  const setScreenPosition = useMapStore((store) => store.setScreenPosition);
  const { camera, gl } = useThree();
  const frameCountRef = useRef(0);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);

  useFrame(() => {
    // Throttle: solo actualizar cada 5 frames para reducir carga
    frameCountRef.current++;
    if (frameCountRef.current % 5 !== 0) {
      return;
    }

    if (!editingObjectPosition) {
      if (lastPositionRef.current !== null) {
        setScreenPosition(null);
        lastPositionRef.current = null;
      }
      return;
    }

    // Convertir posición 3D a coordenadas de pantalla
    const vector = new THREE.Vector3(...editingObjectPosition);
    vector.project(camera);

    const rect = gl.domElement.getBoundingClientRect();
    const screenX = ((vector.x + 1) / 2) * rect.width + rect.left;
    const screenY = ((1 - vector.y) / 2) * rect.height + rect.top;

    // Solo actualizar si la posición cambió significativamente (más de 5px)
    if (
      !lastPositionRef.current ||
      Math.abs(lastPositionRef.current.x - screenX) > 5 ||
      Math.abs(lastPositionRef.current.y - screenY) > 5
    ) {
      setScreenPosition({ x: screenX, y: screenY });
      lastPositionRef.current = { x: screenX, y: screenY };
    }
  });

  return null;
};
