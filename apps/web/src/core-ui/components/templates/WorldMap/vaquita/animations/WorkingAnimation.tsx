'use client';

import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { MathUtils } from 'three';
import { Body, Head, LeftArm, LeftLeg, RightLeg, Tail } from './parts';

interface WorkingVaquitaProps {
  direction: [number, number];
  position: { x: number; y: number; z: number };
  scale?: number;
  label?: string;
}

const WorkingAnimationVaquita = ({ direction, position, scale = 0.5, label }: WorkingVaquitaProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const rightForearmRef = useRef<THREE.Group>(null);
  const animationTime = useRef(0);
  const targetRotation = useRef(0);

  const baseColor = '#fff3e1';
  const bodyColor = '#fff3e1';
  const spotColor = '#6f4e37';
  const helmetColor = '#FBA71A';
  const noseColor = '#e88e29';
  const hoofColor = '#3a2b1b';

  useEffect(() => {
    targetRotation.current = Math.atan2(direction[0], direction[1]);
  }, [direction]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = MathUtils.lerp(groupRef.current.rotation.y, targetRotation.current, delta * 10);
    }

    animationTime.current += delta;

    if (rightArmRef.current && rightForearmRef.current) {
      const swing = Math.sin(animationTime.current * 4);
      rightArmRef.current.rotation.x = (swing * Math.PI) / 6;
      rightForearmRef.current.rotation.x = -Math.max(0, swing) * 0.4;
    }
  });

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]} scale={scale}>
      <Head baseColor={baseColor} spotColor={spotColor} helmetColor={helmetColor} noseColor={noseColor} />
      <Body bodyColor={bodyColor} spotColor={spotColor} />
      <LeftLeg baseColor={baseColor} hoofColor={hoofColor} />
      <RightLeg baseColor={baseColor} hoofColor={hoofColor} />
      <LeftArm ref={leftArmRef} baseColor={baseColor} hoofColor={hoofColor} />

      {/* Right arm with pickaxe — articulated */}
      <group ref={rightArmRef} position={[0.4, 0.78, 0]}>
        <mesh position={[0, -0.12, 0]} castShadow>
          <boxGeometry args={[0.1, 0.24, 0.1]} />
          <meshStandardMaterial color={baseColor} />
        </mesh>
        <mesh position={[0, -0.25, 0]} castShadow>
          <boxGeometry args={[0.11, 0.05, 0.11]} />
          <meshStandardMaterial color={hoofColor} />
        </mesh>
        <group ref={rightForearmRef} position={[0, -0.27, 0]}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <boxGeometry args={[0.1, 0.22, 0.1]} />
            <meshStandardMaterial color={baseColor} />
          </mesh>
          <mesh position={[0, -0.26, 0]} castShadow>
            <boxGeometry args={[0.12, 0.08, 0.12]} />
            <meshStandardMaterial color={hoofColor} />
          </mesh>

          {/* Pickaxe */}
          <group position={[0, -0.26, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <boxGeometry args={[0.5, 0.08, 0.08]} />
              <meshStandardMaterial color="#8B4513" />
            </mesh>
            <mesh position={[0, 0.15, 0]} rotation={[0, Math.PI / 2, Math.PI / 2]}>
              <boxGeometry args={[0.15, 0.25, 0.1]} />
              <meshStandardMaterial color="#A9A9A9" />
            </mesh>
          </group>
        </group>
      </group>

      <Tail spotColor={spotColor} helmetColor={helmetColor} />
      {label && (
        <Text position={[0, 2, 0]} fontSize={0.25} color="black" anchorX="center" anchorY="middle">
          {label}
        </Text>
      )}
    </group>
  );
};

export default WorkingAnimationVaquita;
