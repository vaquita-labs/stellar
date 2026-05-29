'use client';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

interface Props {
  center: [number, number, number];
}

export const SceneCamera = ({ center }: Props) => {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(center[0] + 20, 20, center[2] + 20);
    camera.lookAt(center[0], center[1], center[2]);
  }, [camera, center]);

  return null;
};
