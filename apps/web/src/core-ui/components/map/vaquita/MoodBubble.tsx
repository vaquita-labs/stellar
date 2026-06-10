'use client';

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { VaquitaMood } from '@/core-ui/types';

const MOOD_IMAGE: Record<VaquitaMood, string | null> = {
  excited: '/vaquita/moods/excited.png',
  loved: '/vaquita/moods/loved.png',
  sad: '/vaquita/moods/sad.png',
  normal: null,
};

interface MoodBubbleProps {
  mood: VaquitaMood;
}

export const MoodBubble = ({ mood }: MoodBubbleProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const image = MOOD_IMAGE[mood];

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = 1.05 + Math.sin(clock.elapsedTime * 2.5) * 0.05;
  });

  if (!image) return null;

  return (
    <group ref={groupRef} position={[0, 1.05, 0]}>
      <Html
        center
        distanceFactor={3.5}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            position: 'relative',
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: '#fff8e7',
            border: '3px solid #000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 3px 0 rgba(0,0,0,0.15)',
            userSelect: 'none',
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={mood}
            draggable={false}
            style={{ width: 48, height: 48, objectFit: 'contain' }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: -8,
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: 14,
              height: 14,
              background: '#fff8e7',
              borderRight: '3px solid #000',
              borderBottom: '3px solid #000',
            }}
          />
        </div>
      </Html>
    </group>
  );
};
