import React from 'react';

export const Eyes = ({ isCrying = false }: { isCrying?: boolean }) => {
  if (isCrying) {
    return (
      <group position={[0, 0, 0]}>
        {/* left eye */}
        {/* top eye */}
        <mesh position={[-0.12, 0.15, 0.26]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.15, 0.05, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
        {/* bottom eye */}
        <mesh position={[-0.1, 0.06, 0.26]}>
          <boxGeometry args={[0.08, 0.1, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>

        {/* right eye */}
        {/* top eye */}
        <mesh position={[0.13, 0.15, 0.26]} rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.15, 0.05, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>

        {/* bottom eye */}
        <mesh position={[0.1, 0.06, 0.26]}>
          <boxGeometry args={[0.08, 0.1, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
      </group>
    );
  } else {
    return (
      <group position={[0, 0, 0]}>
        <mesh position={[-0.1, 0.06, 0.26]}>
          <boxGeometry args={[0.07, 0.15, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
        <mesh position={[0.1, 0.06, 0.26]}>
          <boxGeometry args={[0.07, 0.15, 0]} />
          <meshStandardMaterial color="black" />
        </mesh>
      </group>
    );
  }
};
