'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getTileTopY } from '../../../helpers';
import { useDayCycleStore, useMapStore, useVaquitaPositionsStore } from '../../../stores';
import { DepositWithdrawalState, VaquitaAnimationState } from '../../../types';
import { findNearbyWorkSpot, getNextTileToward, pickRandomWalkableGoal, tilesEqual } from './helpers';
import { VaquitaControllerProps } from './types';
import { VaquitaAnimation } from './VaquitaAnimation';
import { VaquitaBrain } from './VaquitaBrain';

const SPEED = 0.6;
const IDLE_MIN_MS = 3000;
const IDLE_RANGE_MS = 4000;
const STUCK_PAUSE_MIN_MS = 1500;
const STUCK_PAUSE_RANGE_MS = 1500;

export const Vaquita = ({ vaquita, onSelect, headLabel }: VaquitaControllerProps) => {
  const ref = useRef<THREE.Group>(null);
  const { gl } = useThree();

  const [scale, setScale] = useState(0.5);
  const [direction, setDirection] = useState<[number, number]>([1, 1]);
  const [brainState, setBrainState] = useState<VaquitaAnimationState>('walking');

  const isWalkable = useMapStore((store) => store.isWalkable);
  const getTileAt = useMapStore((store) => store.getTileAt);

  const vaquitaIdRef = useRef(String(vaquita.id));

  const initialTile: [number, number] = useMemo(() => {
    const store = useVaquitaPositionsStore.getState();
    const id = vaquitaIdRef.current;
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * 8) + 1;
      const z = Math.floor(Math.random() * 8) + 1;
      if (!isWalkable(x, z)) continue;
      if (store.isTileOccupied(x, z, id)) continue;
      store.setClaim(id, [x, z], [x, z]);
      return [x, z];
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

  useEffect(() => {
    const id = vaquitaIdRef.current;
    useVaquitaPositionsStore.getState().setClaim(id, currentTileRef.current, targetTileRef.current);
    return () => {
      useVaquitaPositionsStore.getState().removeClaim(id);
    };
  }, []);

  const isOccupiedByOther = (x: number, z: number) =>
    useVaquitaPositionsStore.getState().isTileOccupied(x, z, vaquitaIdRef.current);

  const syncClaim = () => {
    useVaquitaPositionsStore
      .getState()
      .setClaim(vaquitaIdRef.current, currentTileRef.current, targetTileRef.current);
  };

  const settleAtCurrent = () => {
    targetTileRef.current = [currentTileRef.current[0], currentTileRef.current[1]];
    targetPosRef.current.copy(currentPosRef.current);
    syncClaim();
  };

  const updateBrainState = (state: VaquitaAnimationState) => {
    if (brainState !== state) setBrainState(state);
  };

  const updateDirection = (dir: [number, number]) => {
    if (dir[0] !== direction[0] || dir[1] !== direction[1]) setDirection(dir);
  };

  const pickGoalFor = (phase: VaquitaAnimationState): [number, number] => {
    if (phase === 'working') {
      const workSpot = findNearbyWorkSpot(currentTileRef.current, getTileAt, isWalkable, isOccupiedByOther);
      if (workSpot) return workSpot;
    }
    return pickRandomWalkableGoal(currentTileRef.current, isWalkable, isOccupiedByOther);
  };

  useFrame((_, delta) => {
    if (!ref.current) return;
    const dt = Math.min(delta, 0.1);
    const dayProgress = useDayCycleStore.getState().dayProgress;
    const phase = brainRef.current.tick(dayProgress);
    const now = performance.now();

    if (phase !== lastPhaseRef.current) {
      goalRef.current = null;
      idleUntilRef.current = 0;
      lastPhaseRef.current = phase;
    }

    const stepDistance = SPEED * dt;
    const distToTarget = currentPosRef.current.distanceTo(targetPosRef.current);
    if (distToTarget <= stepDistance) {
      currentPosRef.current.copy(targetPosRef.current);
      if (!tilesEqual(currentTileRef.current, targetTileRef.current)) {
        currentTileRef.current = [targetTileRef.current[0], targetTileRef.current[1]];
        syncClaim();
      }
    } else {
      const alpha = Math.min(stepDistance / distToTarget, 1);
      currentPosRef.current.lerp(targetPosRef.current, alpha);
    }

    const standingStill = tilesEqual(currentTileRef.current, targetTileRef.current);

    if (phase === 'sleeping') {
      if (standingStill) {
        updateBrainState('sleeping');
      } else {
        updateBrainState('walking');
      }
      ref.current.position.copy(currentPosRef.current);
      return;
    }

    if (idleUntilRef.current > 0) {
      if (now < idleUntilRef.current) {
        if (phase === 'working' && standingStill) {
          updateBrainState('working');
        } else {
          updateBrainState('walking');
          if (standingStill) updateDirection([0, 0]);
        }
        ref.current.position.copy(currentPosRef.current);
        return;
      }
      idleUntilRef.current = 0;
      goalRef.current = null;
    }

    if (!standingStill) {
      updateBrainState('walking');
      ref.current.position.copy(currentPosRef.current);
      return;
    }

    if (!goalRef.current) {
      goalRef.current = pickGoalFor(phase);
    }

    const atGoal = tilesEqual(currentTileRef.current, goalRef.current);

    if (atGoal) {
      if (phase === 'working') {
        updateBrainState('working');
      } else {
        updateBrainState('walking');
        updateDirection([0, 0]);
      }
      idleUntilRef.current = now + IDLE_MIN_MS + Math.random() * IDLE_RANGE_MS;
      ref.current.position.copy(currentPosRef.current);
      return;
    }

    const nextStep = getNextTileToward(currentTileRef.current, goalRef.current, isWalkable, isOccupiedByOther);
    if (tilesEqual(nextStep, currentTileRef.current)) {
      goalRef.current = null;
      settleAtCurrent();
      idleUntilRef.current = now + STUCK_PAUSE_MIN_MS + Math.random() * STUCK_PAUSE_RANGE_MS;
      updateDirection([0, 0]);
      updateBrainState('walking');
      ref.current.position.copy(currentPosRef.current);
      return;
    }

    targetTileRef.current = nextStep;
    targetPosRef.current.set(nextStep[0], initialY, nextStep[1]);
    syncClaim();
    updateDirection([nextStep[0] - currentTileRef.current[0], nextStep[1] - currentTileRef.current[1]]);
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
