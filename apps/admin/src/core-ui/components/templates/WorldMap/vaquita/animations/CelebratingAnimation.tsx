'use client';

import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { Body, Head, LeftLeg, RightLeg } from './parts';

interface CelebratingAnimationProps {
  position: { x: number; y: number; z: number };
  direction: [number, number];
  scale?: number;
  label?: string;
}

const CelebratingAnimation = ({ position, scale = 0.5, direction, label }: CelebratingAnimationProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const coinRef = useRef<THREE.Mesh>(null);

  const baseColor = '#fff3e1';
  const bodyColor = '#E4D9C9';
  const spotColor = '#6f4e37';
  const helmetColor = '#FBA71A';
  const noseColor = '#e88e29';
  const hoofColor = '#3a2b1b';
  const coinColor = '#FFC300';

  useFrame(() => {
    if (!groupRef.current) return;

    const angle = Math.atan2(direction[0], direction[1]);
    groupRef.current.rotation.y = angle;

    // Bounce
    const time = Date.now() * 0.002;
    const jump = Math.abs(Math.sin(time)) ** 1.5; // smoother jump shape
    groupRef.current.position.y = position.y + jump * 0.3;

    // Animate coin
    if (coinRef.current) {
      coinRef.current.rotation.y += 0.1;
      coinRef.current.position.y = 2.2 + Math.sin(Date.now() * 0.005) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]} scale={scale}>
      <Head baseColor={baseColor} spotColor={spotColor} helmetColor={helmetColor} noseColor={noseColor} />
      <Body bodyColor={bodyColor} spotColor={spotColor} />
      {/* Arms raised */}
      {/* <mesh position={[-0.5, 1.0, 0]} rotation={[0, 0, 0.8]}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial color={baseColor} />
      </mesh>
      <mesh position={[0.5, 1.0, 0]} rotation={[0, 0, -0.8]}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial color={baseColor} />
      </mesh> */}
      {/* Coin */}
      <mesh ref={coinRef} position={[0.7, 2, 0]} rotation={[0, 0, 1]}>
        <cylinderGeometry args={[0.3, 0.3, 0.05, 32]} />
        <meshStandardMaterial color={coinColor} />
      </mesh>
      <LeftLeg baseColor={baseColor} hoofColor={hoofColor} />
      <RightLeg baseColor={baseColor} hoofColor={hoofColor} />
      {/* left arm */}
      <group position={[0.5, 0.8, 0]} rotation={[0, 0, 2]}>
        <mesh>
          <boxGeometry args={[0.1, 0.5, 0.1]} />
          <meshStandardMaterial color={baseColor} />
        </mesh>
        <mesh position={[0, -0.25, 0]}>
          <boxGeometry args={[0.12, 0.1, 0.12]} />
          <meshStandardMaterial color={hoofColor} />
        </mesh>
      </group>
      {/* right arm */}
      <group position={[-0.5, 0.8, 0]} rotation={[0, 0, -2]}>
        <mesh>
          <boxGeometry args={[0.1, 0.5, 0.1]} />
          <meshStandardMaterial color={baseColor} />
        </mesh>
        <mesh position={[0, -0.25, 0]}>
          <boxGeometry args={[0.12, 0.1, 0.12]} />
          <meshStandardMaterial color={hoofColor} />
        </mesh>
      </group>
      {/* tail */}
      <group position={[0, 0.1, -0.15]}>
        <mesh position={[0, 0, -0.1]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.05, 0.05, 0.1]} />
          <meshStandardMaterial color={spotColor} />
        </mesh>
        <mesh position={[0, -0.05, -0.15]} rotation={[-1, 0, 0]}>
          <boxGeometry args={[0.05, 0.05, 0.1]} />
          <meshStandardMaterial color={spotColor} />
        </mesh>
        <mesh position={[0, -0.1, -0.2]}>
          <boxGeometry args={[0.07, 0.07, 0.07]} />
          <meshStandardMaterial color={helmetColor} />
        </mesh>
      </group>
      {Array.from({ length: 15 }).map((_, i) => (
        <mesh key={i} position={[Math.random() * 2 - 1, 1.5 + Math.random() * 1.5, Math.random() * 2 - 1]}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshStandardMaterial color={['#FF3B3B', '#34D399', '#3B82F6', '#FBBF24'][i % 4]} />
        </mesh>
      ))}
      {label && (
        <Text position={[0, 2, 0]} fontSize={0.25} color="black" anchorX="center" anchorY="middle">
          {label}
        </Text>
      )}
    </group>
  );
};

export default CelebratingAnimation;
