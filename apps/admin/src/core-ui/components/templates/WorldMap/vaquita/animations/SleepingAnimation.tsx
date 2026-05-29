'use client';

import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { Body, Head, LeftArm, LeftLeg, RightArm, RightLeg, Tail } from './parts';

interface SleepingAnimationProps {
  direction: [number, number];
  scale?: number;
  label?: string;
}

const SleepingAnimation = ({  scale = 0.5, direction, label }: SleepingAnimationProps) => {
  const groupRef = useRef<THREE.Group>(null);

  const baseColor = '#fff3e1';
  const bodyColor = '#E4D9C9';
  const spotColor = '#6f4e37';
  const helmetColor = '#FBA71A';
  const noseColor = '#e88e29';
  const hoofColor = '#3a2b1b';

  // Optional: bobbing Zzz
  useFrame(() => {
    if (!groupRef.current) return;

    // Align sleeping direction
    const angle = Math.atan2(direction[0], direction[1]);
    groupRef.current.rotation.y = angle;

    // Animate "zzz"
    groupRef.current.children.forEach((child) => {
      if (child.name === 'zzz') {
        child.position.y = 2.2 + Math.sin(Date.now() * 0.002) * 0.1;
      }
    });
  });

  return (
    <group ref={groupRef} scale={scale}>
      <Head baseColor={baseColor} spotColor={spotColor} helmetColor={helmetColor} noseColor={noseColor} />
      <Body bodyColor={bodyColor} spotColor={spotColor} />
      <LeftLeg baseColor={baseColor} hoofColor={hoofColor} />
      <RightLeg baseColor={baseColor} hoofColor={hoofColor} />
      <LeftArm baseColor={baseColor} hoofColor={hoofColor} />
      <RightArm baseColor={baseColor} hoofColor={hoofColor} />
      <Tail spotColor={spotColor} helmetColor={helmetColor} />
      <group name="zzz" position={[0, 0, 0]}>
        <Text
          fontSize={0.3}
          color="#000"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="black"
          position={[0, -0.3, 0]}
        >
          Zzz
        </Text>
      </group>
      {label && (
        <Text position={[0, 2, 0]} fontSize={0.25} color="black" anchorX="center" anchorY="middle">
          {label}
        </Text>
      )}
    </group>
  );
};

export default SleepingAnimation;
