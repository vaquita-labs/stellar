'use client';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

interface Props {
  center: [number, number, number];
}

export const SceneCamera = ({ center }: Props) => {
  const { camera } = useThree();
  const initialized = useRef(false);

  useEffect(() => {
    // Solo inicializar la cámara una vez, no reposicionarla cada vez que el componente se actualiza
    if (!initialized.current) {
      camera.position.set(center[0] + 20, 20, center[2] + 20);
      camera.lookAt(center[0], center[1], center[2]);
      initialized.current = true;
    }
  }, [camera, center]);

  return null;
};
