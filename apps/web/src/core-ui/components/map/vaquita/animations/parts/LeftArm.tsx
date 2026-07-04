import { useFrame } from '@react-three/fiber';
import { forwardRef, MutableRefObject, useRef } from 'react';
import * as THREE from 'three';

interface LeftArmProps {
  baseColor: string;
  hoofColor: string;
  walkCycleRef?: MutableRefObject<number>;
  isMoving?: boolean;
  phaseOffset?: number;
}

export const LeftArm = forwardRef<THREE.Group, LeftArmProps>(function LeftArmCmp(
  { baseColor, hoofColor, walkCycleRef, isMoving = false, phaseOffset = Math.PI },
  leftArmRef,
) {
  const lowerRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!lowerRef.current) return;
    if (walkCycleRef && isMoving) {
      const phase = walkCycleRef.current + phaseOffset;
      lowerRef.current.rotation.x = -Math.max(0, Math.sin(phase)) * 0.5;
    } else {
      lowerRef.current.rotation.x = 0;
    }
  });

  return (
    <group ref={leftArmRef} position={[-0.4, 0.78, 0]}>
      <mesh position={[0, -0.12, 0]} castShadow>
        <boxGeometry args={[0.1, 0.24, 0.1]} />
        <meshStandardMaterial color={baseColor} />
      </mesh>
      <mesh position={[0, -0.25, 0]} castShadow>
        <boxGeometry args={[0.11, 0.05, 0.11]} />
        <meshStandardMaterial color={hoofColor} />
      </mesh>
      <group ref={lowerRef} position={[0, -0.27, 0]}>
        <mesh position={[0, -0.12, 0]} castShadow>
          <boxGeometry args={[0.1, 0.22, 0.1]} />
          <meshStandardMaterial color={baseColor} />
        </mesh>
        <mesh position={[0, -0.26, 0]} castShadow>
          <boxGeometry args={[0.12, 0.08, 0.12]} />
          <meshStandardMaterial color={hoofColor} />
        </mesh>
      </group>
    </group>
  );
});
