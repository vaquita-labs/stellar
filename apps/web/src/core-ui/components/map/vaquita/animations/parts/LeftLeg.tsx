import { useFrame } from '@react-three/fiber';
import { forwardRef, MutableRefObject, useRef } from 'react';
import * as THREE from 'three';

interface LeftLegProps {
  baseColor: string;
  hoofColor: string;
  walkCycleRef?: MutableRefObject<number>;
  isMoving?: boolean;
  phaseOffset?: number;
}

export const LeftLeg = forwardRef<THREE.Group, LeftLegProps>(function LeftLegCmp(
  { baseColor, hoofColor, walkCycleRef, isMoving = false, phaseOffset = 0 },
  leftLegRef,
) {
  const lowerRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!lowerRef.current) return;
    if (walkCycleRef && isMoving) {
      const phase = walkCycleRef.current + phaseOffset;
      lowerRef.current.rotation.x = Math.max(0, Math.sin(phase)) * 0.6;
    } else {
      lowerRef.current.rotation.x = 0;
    }
  });

  return (
    <group ref={leftLegRef} position={[-0.15, -0.1, 0]}>
      <mesh position={[0, 0.13, 0]} castShadow>
        <boxGeometry args={[0.2, 0.24, 0.2]} />
        <meshStandardMaterial color={baseColor} />
      </mesh>
      <mesh position={[0, 0.01, 0]} castShadow>
        <boxGeometry args={[0.21, 0.06, 0.21]} />
        <meshStandardMaterial color={hoofColor} />
      </mesh>
      <group ref={lowerRef} position={[0, -0.02, 0]}>
        <mesh position={[0, -0.13, 0]} castShadow>
          <boxGeometry args={[0.18, 0.22, 0.18]} />
          <meshStandardMaterial color={baseColor} />
        </mesh>
        <mesh position={[0, -0.27, 0]} castShadow>
          <boxGeometry args={[0.22, 0.08, 0.22]} />
          <meshStandardMaterial color={hoofColor} />
        </mesh>
      </group>
    </group>
  );
});
