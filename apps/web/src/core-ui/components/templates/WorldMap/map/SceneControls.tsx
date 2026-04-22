'use client';
import { OrbitControls } from '@react-three/drei';
import { useIsMobile } from '../../../../hooks';

interface Props {
  center: [number, number, number];
}

export const SceneControls = ({ center }: Props) => {
  const isMobile = useIsMobile();
  
  // En mobile permitimos alejar más la cámara
  const maxDistance = isMobile ? 27 : 20;

  return (
    <OrbitControls
      enablePan={false}
      enableZoom={true}
      enableRotate={true}
      target={center}
      minPolarAngle={0.2 * Math.PI}
      maxPolarAngle={0.45 * Math.PI}
      minDistance={10}
      maxDistance={maxDistance}
    />
  );
};
