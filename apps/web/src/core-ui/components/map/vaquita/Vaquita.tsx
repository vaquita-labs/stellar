'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getTileTopY } from '../../../helpers';
import { useDayCycleStore, useMapStore } from '../../../stores';
import { DepositWithdrawalState, VaquitaAnimationState } from '../../../types';
import { findNearbyWorkSpot, getNextTileToward, pickRandomWalkableGoal, tilesEqual } from './helpers';
import { VaquitaControllerProps } from './types';
import { VaquitaAnimation } from './VaquitaAnimation';
import { VaquitaBrain } from './VaquitaBrain';

const SPEED = 0.6;
const IDLE_MIN_MS = 3000;
const IDLE_RANGE_MS = 4000;

export const Vaquita = ({ vaquita, onSelect, headLabel }: VaquitaControllerProps) => {
  const ref = useRef<THREE.Group>(null);
  const { gl } = useThree();

  const [scale, setScale] = useState(0.5);
  const [direction, setDirection] = useState<[number, number]>([1, 1]);
  const [brainState, setBrainState] = useState<VaquitaAnimationState>('walking');

  const isWalkable = useMapStore((store) => store.isWalkable);
  const getTileAt = useMapStore((store) => store.getTileAt);

  const initialTile: [number, number] = useMemo(() => {
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * 8) + 1;
      const z = Math.floor(Math.random() * 8) + 1;
      if (isWalkable(x, z)) return [x, z];
    }
    return [0, 0];
  }, [isWalkable]);

  const initialY = getTileTopY() - 0.3;
  const currentTileRef = useRef<[number, number]>(initialTile);
  const targetTileRef = useRef<[number, number]>(initialTile);
  const currentPosRef = useRef(new THREE.Vector3(initialTile[0], initialY, initialTile[1]));
  const targetPosRef = useRef(new THREE.Vector3(initialTile[0], initialY, initialTile[1]));

  const brainRef = useRef(new VaquitaBrain('walking'));
  const goalRef = useRef<[number, number] | null>(null);
  const idleUntilRef = useRef(0);
  const lastPhaseRef = useRef<VaquitaAnimationState>('walking');

  const settleAtCurrent = () => {
    targetTileRef.current = [currentTileRef.current[0], currentTileRef.current[1]];
    targetPosRef.current.copy(currentPosRef.current);
  };

  const snapCurrentToTile = () => {
    currentPosRef.current.set(currentTileRef.current[0], initialY, currentTileRef.current[1]);
    targetTileRef.current = [currentTileRef.current[0], currentTileRef.current[1]];
    targetPosRef.current.copy(currentPosRef.current);
  };

  const updateBrainState = (state: VaquitaAnimationState) => {
    if (brainState !== state) setBrainState(state);
  };

  const updateDirection = (dir: [number, number]) => {
    if (dir[0] !== direction[0] || dir[1] !== direction[1]) setDirection(dir);
  };

  const pickGoalFor = (phase: VaquitaAnimationState): [number, number] => {
    if (phase === 'working') {
      const workSpot = findNearbyWorkSpot(currentTileRef.current, getTileAt, isWalkable);
      if (workSpot) return workSpot;
    }
    return pickRandomWalkableGoal(currentTileRef.current, isWalkable);
  };

  useFrame((_, delta) => {
    if (!ref.current) return;
    const dt = Math.min(delta, 0.1);
    const dayProgress = useDayCycleStore.getState().dayProgress;
    const phase = brainRef.current.tick(dayProgress);

    if (phase !== lastPhaseRef.current) {
      goalRef.current = null;
      idleUntilRef.current = 0;
      if (tilesEqual(currentTileRef.current, targetTileRef.current)) {
        settleAtCurrent();
      }
      lastPhaseRef.current = phase;
    }

    if (phase === 'sleeping') {
      if (tilesEqual(currentTileRef.current, targetTileRef.current)) {
        snapCurrentToTile();
      }
      updateBrainState('sleeping');
      ref.current.position.copy(currentPosRef.current);
      return;
    }

    const stepDistance = SPEED * dt;
    const distToTarget = currentPosRef.current.distanceTo(targetPosRef.current);

    if (distToTarget <= stepDistance) {
      currentPosRef.current.copy(targetPosRef.current);
      if (!tilesEqual(currentTileRef.current, targetTileRef.current)) {
        currentTileRef.current = [targetTileRef.current[0], targetTileRef.current[1]];
      }
    } else {
      const alpha = Math.min(stepDistance / distToTarget, 1);
      currentPosRef.current.lerp(targetPosRef.current, alpha);
    }

    const standingStill = tilesEqual(currentTileRef.current, targetTileRef.current);

    if (!goalRef.current) {
      goalRef.current = pickGoalFor(phase);
    }

    const atGoal = tilesEqual(currentTileRef.current, goalRef.current);

    if (atGoal && standingStill) {
      if (phase === 'working') {
        updateBrainState('working');
      } else {
        const now = performance.now();
        if (idleUntilRef.current === 0) {
          idleUntilRef.current = now + IDLE_MIN_MS + Math.random() * IDLE_RANGE_MS;
        }
        if (now < idleUntilRef.current) {
          updateBrainState('walking');
          updateDirection([0, 0]);
        } else {
          goalRef.current = null;
          idleUntilRef.current = 0;
        }
      }
      ref.current.position.copy(currentPosRef.current);
      return;
    }

    if (standingStill) {
      const nextStep = getNextTileToward(currentTileRef.current, goalRef.current, isWalkable);
      if (tilesEqual(nextStep, currentTileRef.current)) {
        goalRef.current = null;
        settleAtCurrent();
        ref.current.position.copy(currentPosRef.current);
        return;
      }
      if (!isWalkable(nextStep[0], nextStep[1])) {
        goalRef.current = null;
        settleAtCurrent();
        ref.current.position.copy(currentPosRef.current);
        return;
      }
      targetTileRef.current = nextStep;
      targetPosRef.current.set(nextStep[0], initialY, nextStep[1]);
      updateDirection([nextStep[0] - currentTileRef.current[0], nextStep[1] - currentTileRef.current[1]]);
    }

    updateBrainState('walking');

    if (vaquita.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY) return;
    ref.current.position.copy(currentPosRef.current);
  });

  const handleClick = () => {
    if (brainRef.current.state === 'sleeping') {
      brainRef.current.forceState('walking');
      goalRef.current = null;
      idleUntilRef.current = 0;
      settleAtCurrent();
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
