'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getTileTopY } from '../../../helpers';
import { useMapStore } from '../../../stores';
import { DepositWithdrawalState } from '../../../types';
import { getNextValidTile } from './helpers';
import { VaquitaControllerProps } from './types';
import { VaquitaAnimation } from './VaquitaAnimation';
import { VaquitaBrain } from './VaquitaBrain';

export const Vaquita = ({ vaquita, onSelect, headLabel }: VaquitaControllerProps) => {
  const ref = useRef<THREE.Group>(null);
  const { gl } = useThree();

  const [scale, setScale] = useState(0.5);
  const [direction, setDirection] = useState<[number, number]>([1, 1]);

  const isWalkable = useMapStore((store) => store.isWalkable);

  // TODO: REVIEW THIS
  const initialTile: [number, number] = useMemo(() => {
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * 8) + 1;
      const z = Math.floor(Math.random() * 8) + 1;
      if (isWalkable(x, z)) {
        return [x, z];
      }
    }
    return [0, 0];
  }, [isWalkable]);

  const currentTileRef = useRef<[number, number]>(initialTile);
  const targetTileRef = useRef<[number, number]>(initialTile);
  const currentPosRef = useRef(new THREE.Vector3(initialTile[0], getTileTopY(), initialTile[1]));
  const targetPosRef = useRef(new THREE.Vector3(initialTile[0], getTileTopY(), initialTile[1]));

  const brainRef = useRef(new VaquitaBrain('walking', initialTile));

  useFrame((_, delta) => {
    if (ref.current && !(brainRef.current.state === 'working' || brainRef.current.state === 'sleeping')) {
      // Cambios controlados por el "cerebro"
      if (brainRef.current.shouldChangeState()) {
        brainRef.current.state = brainRef.current.nextState();
      }

      if (brainRef.current.state === 'walking') {
        const distance = currentPosRef.current.distanceTo(targetPosRef.current);
        const speed = 2; // unidades por segundo
        const step = speed * delta;
        if (distance <= step) {
          const [cx, cz] = currentTileRef.current;
          const nextStep = getNextValidTile([cx, cz], isWalkable);

          targetTileRef.current = nextStep;
          // TODO: Control the height of the vaquita
          targetPosRef.current.set(nextStep[0], getTileTopY() - 0.3, nextStep[1]);

          const newDir: [number, number] = [nextStep[0] - cx, nextStep[1] - cz];
          setDirection(newDir);

          brainRef.current.updatePosition(nextStep);
          currentTileRef.current = nextStep;
        }

        currentPosRef.current.lerp(targetPosRef.current, step);
        if (vaquita.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY) return;
        ref.current.position.copy(currentPosRef.current);
      } else {
        ref.current.position.copy(targetPosRef.current);
      }
    }
  });

  return (
    <group
      ref={ref}
      onClick={() => onSelect?.(vaquita)}
      onPointerOver={() => {
        setScale(0.6);
        gl.domElement.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setScale(0.5);
        gl.domElement.style.cursor = 'default';
      }}
    >
      <VaquitaAnimation status={vaquita.state} direction={direction} scale={scale} label={headLabel} />
    </group>
  );
};
