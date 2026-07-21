'use client';
import { OrbitControls } from '@react-three/drei';
import { useIsMobile } from '@/core-ui/hooks';

// Tope de inclinación: evita que la cámara baje hasta quedar a ras del suelo
const MAX_POLAR_ANGLE = 0.36 * Math.PI;

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
      maxPolarAngle={MAX_POLAR_ANGLE}
      minDistance={10}
      maxDistance={maxDistance}
    />
  );
};
