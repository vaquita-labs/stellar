'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getTileTopY } from '../../../helpers';
import { useDayCycleStore, useMapStore } from '../../../stores';
import { DepositWithdrawalState, VaquitaAnimationState } from '../../../types';
import { getNextValidTile } from './helpers';
import { VaquitaControllerProps } from './types';
import { VaquitaAnimation } from './VaquitaAnimation';
import { VaquitaBrain } from './VaquitaBrain';

export const Vaquita = ({ vaquita, onSelect, headLabel }: VaquitaControllerProps) => {
  const ref = useRef<THREE.Group>(null);
  const { gl } = useThree();

  const [scale, setScale] = useState(0.5);
  const [direction, setDirection] = useState<[number, number]>([1, 1]);
  const [brainState, setBrainState] = useState<VaquitaAnimationState>('walking');

  const isWalkable = useMapStore((store) => store.isWalkable);

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

  const brainRef = useRef(new VaquitaBrain('walking'));

  useFrame((_, delta) => {
    if (!ref.current) return;

    const dayProgress = useDayCycleStore.getState().dayProgress;
    const nextState = brainRef.current.tick(dayProgress);
    if (nextState !== brainState) setBrainState(nextState);

    if (nextState === 'walking') {
      const distance = currentPosRef.current.distanceTo(targetPosRef.current);
      const speed = 2;
      const step = speed * delta;
      if (distance <= step) {
        const [cx, cz] = currentTileRef.current;
        const nextStep = getNextValidTile([cx, cz], isWalkable);

        targetTileRef.current = nextStep;
        targetPosRef.current.set(nextStep[0], getTileTopY() - 0.3, nextStep[1]);

        const newDir: [number, number] = [nextStep[0] - cx, nextStep[1] - cz];
        setDirection(newDir);

        currentTileRef.current = nextStep;
      }

      currentPosRef.current.lerp(targetPosRef.current, step);
      if (vaquita.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY) return;
      ref.current.position.copy(currentPosRef.current);
    } else {
      currentPosRef.current.copy(targetPosRef.current);
      ref.current.position.copy(currentPosRef.current);
    }
  });

  const handleClick = () => {
    if (brainRef.current.state === 'sleeping') {
      brainRef.current.forceState('walking');
      setBrainState('walking');
      return;
    }
    onSelect?.(vaquita);
  };

  return (
    <group
      ref={ref}
      onClick={handleClick}
      onPointerOver={() => {
        setScale(0.6);
        gl.domElement.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setScale(0.5);
        gl.domElement.style.cursor = 'default';
      }}
    >
      <VaquitaAnimation
        status={vaquita.state}
        brainState={brainState}
        direction={direction}
        scale={scale}
        label={headLabel}
      />
    </group>
  );
};
