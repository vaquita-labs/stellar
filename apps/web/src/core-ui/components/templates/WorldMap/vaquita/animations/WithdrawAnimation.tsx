'use client';

import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

interface WithdrawAnimationProps {
  scale?: number;
  label?: string;
}

const WithdrawAnimation = ({ scale = 10, label }: WithdrawAnimationProps) => {
  const crossRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (crossRef.current) {
      crossRef.current.rotation.y += delta * 0.5; // ligera animación (opcional)
    }
  });

  return (
    <group  scale={scale} position={[0, -0.2, 0]}>
      {/* Base (e.g., grave) */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.4, 0.05, 0.4]} />
        <meshStandardMaterial color="#677922" />
      </mesh>

      {/* Cross */}
      <mesh ref={crossRef} position={[0, 0.25, 0]}>
        <boxGeometry args={[0.09, 1.2, 0.09]} />
        <meshStandardMaterial color="#593012" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.09, 0.1, 0.5]} />
        <meshStandardMaterial color="#593012" />
      </mesh>
      {label && (
        <Text position={[0, 1, 0]} fontSize={0.25} color="black" anchorX="center" anchorY="middle">
          {label}
        </Text>
      )}
    </group>
  );
};

export default WithdrawAnimation;
