'use client';

import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MathUtils } from 'three';
import { applyBlinkEffect } from './effects';
import { Body, Head, LeftArm, LeftLeg, RightArm, RightLeg, Tail } from './parts';

interface VaquitaModelProps {
  direction: [number, number];
  scale?: number;
  blinking?: boolean;
  label?: string;
  color?: string;
}

const VaquitaModel = ({
  direction = [0, 1],
  scale = 0.5,
  blinking = false,
  label,
  color,
}: VaquitaModelProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const [isMoving, setIsMoving] = useState(true);
  const walkCycle = useRef(0);
  const targetRotation = useRef(0);

  const baseColor = '#fff3e1';
  const bodyColor = '#E4D9C9';
  const spotColor = '#6f4e37';
  const helmetColor = '#FBA71A';
  const noseColor = '#e88e29';
  const hoofColor = '#3a2b1b';

  useEffect(() => {
    const moving = direction[0] !== 0 || direction[1] !== 0;
    setIsMoving(moving);
    if (moving) {
      targetRotation.current = Math.atan2(direction[0], direction[1]);
    }
  }, [direction]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Smooth rotation
    groupRef.current.rotation.y = MathUtils.lerp(groupRef.current.rotation.y, targetRotation.current, delta * 10);

    // Animate limbs
    if (leftLegRef.current && rightLegRef.current && leftArmRef.current && rightArmRef.current) {
      if (isMoving) {
        walkCycle.current += delta * 10;
        leftLegRef.current.rotation.x = Math.sin(walkCycle.current) * 0.3;
        rightLegRef.current.rotation.x = Math.sin(walkCycle.current + Math.PI) * 0.3;
        leftArmRef.current.rotation.x = Math.sin(walkCycle.current + Math.PI) * 0.2;
        rightArmRef.current.rotation.x = Math.sin(walkCycle.current) * 0.2;
      } else {
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
        leftArmRef.current.rotation.x = 0;
        rightArmRef.current.rotation.x = 0;
        walkCycle.current = 0;
      }
    }
    const time = performance.now() * 0.005;
    applyBlinkEffect(groupRef.current, time, blinking, color);
  });

  return (
    <group ref={groupRef} scale={scale}>
      <Head baseColor={baseColor} spotColor={spotColor} helmetColor={helmetColor} noseColor={noseColor} />
      <Body bodyColor={bodyColor} spotColor={spotColor} />
      <LeftLeg ref={leftLegRef} baseColor={baseColor} hoofColor={hoofColor} />
      <RightLeg ref={rightLegRef} baseColor={baseColor} hoofColor={hoofColor} />
      <LeftArm ref={leftArmRef} baseColor={baseColor} hoofColor={hoofColor} />
      <RightArm ref={rightArmRef} baseColor={baseColor} hoofColor={hoofColor} />
      <Tail spotColor={spotColor} helmetColor={helmetColor} />
      {label && (
        <Billboard>
          <Text fontWeight="bold" position={[0, 2, 0]} fontSize={0.25} color="black" anchorX="center" anchorY="middle">
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  );
};

export default VaquitaModel;
