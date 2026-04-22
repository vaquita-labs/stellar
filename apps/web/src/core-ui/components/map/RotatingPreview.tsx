import { useFrame } from '@react-three/fiber';
import { Object3D } from 'three';

export function RotatingPreview({ object }: { object: Object3D }) {
  useFrame(() => {
    object.rotation.y += 0.01;
  });

  return <primitive object={object} />;
}
