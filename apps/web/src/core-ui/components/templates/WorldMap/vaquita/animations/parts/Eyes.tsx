import React from 'react';
import { VaquitaMood } from '@/core-ui/types';

interface EyesProps {
  isCrying?: boolean;
  isSleeping?: boolean;
  mood?: VaquitaMood;
}

export const Eyes = ({ isCrying = false, isSleeping = false, mood = 'normal' }: EyesProps) => {
  if (isSleeping) {
    return (
      <group position={[0, 0, 0]}>
        <mesh position={[-0.1, 0.06, 0.26]} castShadow>
          <boxGeometry args={[0.12, 0.03, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
        <mesh position={[0.1, 0.06, 0.26]} castShadow>
          <boxGeometry args={[0.12, 0.03, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
      </group>
    );
  }

  if (isCrying || mood === 'sad') {
    return (
      <group position={[0, 0, 0]}>
        <mesh position={[-0.12, 0.15, 0.26]} rotation={[0, 0, 0.3]} castShadow>
          <boxGeometry args={[0.15, 0.05, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
        <mesh position={[-0.1, 0.06, 0.26]} castShadow>
          <boxGeometry args={[0.08, 0.1, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
        <mesh position={[0.13, 0.15, 0.26]} rotation={[0, 0, -0.3]} castShadow>
          <boxGeometry args={[0.15, 0.05, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
        <mesh position={[0.1, 0.06, 0.26]} castShadow>
          <boxGeometry args={[0.08, 0.1, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
        {/* tear drop */}
        <mesh position={[-0.1, -0.02, 0.26]} castShadow>
          <boxGeometry args={[0.04, 0.08, 0]} />
          <meshStandardMaterial color="#5ec4ff" />
        </mesh>
      </group>
    );
  }

  if (mood === 'excited') {
    return (
      <group position={[0, 0, 0]}>
        {/* sparkly star eyes */}
        <mesh position={[-0.1, 0.08, 0.26]} castShadow>
          <boxGeometry args={[0.12, 0.04, 0]} />
          <meshStandardMaterial color="#ffd54a" />
        </mesh>
        <mesh position={[-0.1, 0.08, 0.26]} castShadow>
          <boxGeometry args={[0.04, 0.12, 0]} />
          <meshStandardMaterial color="#ffd54a" />
        </mesh>
        <mesh position={[-0.1, 0.08, 0.26]} rotation={[0, 0, Math.PI / 4]} castShadow>
          <boxGeometry args={[0.1, 0.03, 0]} />
          <meshStandardMaterial color="#ffd54a" />
        </mesh>
        <mesh position={[0.1, 0.08, 0.26]} castShadow>
          <boxGeometry args={[0.12, 0.04, 0]} />
          <meshStandardMaterial color="#ffd54a" />
        </mesh>
        <mesh position={[0.1, 0.08, 0.26]} castShadow>
          <boxGeometry args={[0.04, 0.12, 0]} />
          <meshStandardMaterial color="#ffd54a" />
        </mesh>
        <mesh position={[0.1, 0.08, 0.26]} rotation={[0, 0, Math.PI / 4]} castShadow>
          <boxGeometry args={[0.1, 0.03, 0]} />
          <meshStandardMaterial color="#ffd54a" />
        </mesh>
      </group>
    );
  }

  if (mood === 'loved') {
    return (
      <group position={[0, 0, 0]}>
        {/* heart-shaped eyes (approximated) */}
        <mesh position={[-0.12, 0.08, 0.26]} castShadow>
          <boxGeometry args={[0.06, 0.06, 0]} />
          <meshStandardMaterial color="#ff5b8a" />
        </mesh>
        <mesh position={[-0.08, 0.08, 0.26]} castShadow>
          <boxGeometry args={[0.06, 0.06, 0]} />
          <meshStandardMaterial color="#ff5b8a" />
        </mesh>
        <mesh position={[-0.1, 0.03, 0.26]} castShadow>
          <boxGeometry args={[0.08, 0.06, 0]} />
          <meshStandardMaterial color="#ff5b8a" />
        </mesh>
        <mesh position={[0.08, 0.08, 0.26]} castShadow>
          <boxGeometry args={[0.06, 0.06, 0]} />
          <meshStandardMaterial color="#ff5b8a" />
        </mesh>
        <mesh position={[0.12, 0.08, 0.26]} castShadow>
          <boxGeometry args={[0.06, 0.06, 0]} />
          <meshStandardMaterial color="#ff5b8a" />
        </mesh>
        <mesh position={[0.1, 0.03, 0.26]} castShadow>
          <boxGeometry args={[0.08, 0.06, 0]} />
          <meshStandardMaterial color="#ff5b8a" />
        </mesh>
      </group>
    );
  }

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[-0.1, 0.06, 0.26]} castShadow>
        <boxGeometry args={[0.07, 0.15, 0]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[0.1, 0.06, 0.26]} castShadow>
        <boxGeometry args={[0.07, 0.15, 0]} />
        <meshStandardMaterial color="black" />
      </mesh>
    </group>
  );
};
