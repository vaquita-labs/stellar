'use client';

import { Text } from '@react-three/drei';
import { useRef } from 'react';
import * as THREE from 'three';
import { Body, Head, LeftArm, LeftLeg, RightArm, RightLeg, Tail } from './parts';

interface SadAnimationVaquitaProps {
  direction: [ number, number ];
  position: { x: number; y: number; z: number };
  scale?: number;
  blinking?: boolean;
  label?: string;
}

const SadAnimationVaquita = ({
                               direction = [ 0, 1 ],
                               // position = [0, 0, 0],
                               position = { x: 0, y: 0, z: 0 },
                               scale = 0.5,
                               blinking = false,
                               label,
                             }: SadAnimationVaquitaProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const targetRotation = useRef(0);
  
  const baseColor = '#fff3e1';
  const bodyColor = '#E4D9C9';
  const spotColor = '#6f4e37';
  const helmetColor = '#FBA71A';
  const noseColor = '#e88e29';
  const hoofColor = '#3a2b1b';
  
  return (
    <group ref={groupRef} position={[ position.x, position.y, position.z ]} scale={scale}>
      <Head
        baseColor={baseColor}
        spotColor={spotColor}
        helmetColor={helmetColor}
        noseColor={noseColor}
        isCrying={true}
        isHelmet={true}
      />
      <Body bodyColor={bodyColor} spotColor={spotColor} />
      <LeftLeg ref={leftLegRef} baseColor={baseColor} hoofColor={hoofColor} />
      <RightLeg ref={rightLegRef} baseColor={baseColor} hoofColor={hoofColor} />
      <LeftArm ref={leftArmRef} baseColor={baseColor} hoofColor={hoofColor} />
      <RightArm ref={rightArmRef} baseColor={baseColor} hoofColor={hoofColor} />
      <Tail spotColor={spotColor} helmetColor={helmetColor} />
      {label && (
        <Text position={[ 0, 2, 0 ]} fontSize={0.25} color="black" anchorX="center" anchorY="middle">
          {label}
        </Text>
      )}
    </group>
  );
};

export default SadAnimationVaquita;
