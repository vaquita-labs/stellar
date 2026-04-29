'use client';

import { getTileTopY } from '@/core-ui/helpers/map';
import { useMapStore } from '@/core-ui/stores';
import { DepositWithdrawalState } from '@/core-ui/types';
import { Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useDayCycleStore } from '@/core-ui/stores';
import { getNextValidTile } from '../../../map/vaquita/helpers';
import { VaquitaBrain } from '../../../map/vaquita/VaquitaBrain';
import { Body } from '../vaquita/animations/parts';
import { VaquitaControllerProps } from './types';

// const baseColor = '#fff3e1';
const bodyColor = '#E4D9C9';
const spotColor = '#6f4e37';
// const helmetColor = '#FBA71A';
// const noseColor = '#e88e29';
// const hoofColor = '#3a2b1b';

interface VaquitasInstancedProps {
  deposits: VaquitaControllerProps['vaquita'][];
  tokenSymbol: string;
  onSelect: (v: VaquitaControllerProps['vaquita']) => void;
}

// FOLLOWING NO WORKS
export const VaquitasInstanced = ({ deposits, onSelect }: VaquitasInstancedProps) => {
  // const meshRef = useRef<THREE.InstancedMesh>(null);
  const isWalkable = useMapStore((store) => store.isWalkable);

  // Generador de posiciones iniciales
  const initialTile = useCallback((): [number, number] => {
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * 8) + 1;
      const z = Math.floor(Math.random() * 8) + 1;
      if (isWalkable(x, z)) return [x, z];
    }
    return [0, 0];
  }, [isWalkable]);

  // Arrays de estado por cada vaquita
  const brainsRef = useRef<VaquitaBrain[]>([]);
  const currentTileRef = useRef<[number, number][]>([]);
  const targetTileRef = useRef<[number, number][]>([]);
  const currentPosRef = useRef<THREE.Vector3[]>([]);
  const targetPosRef = useRef<THREE.Vector3[]>([]);

  // Inicializar todas las vaquitas (solo 1 vez)
  useMemo(() => {
    brainsRef.current = [];
    currentTileRef.current = [];
    targetTileRef.current = [];
    currentPosRef.current = [];
    targetPosRef.current = [];

    deposits.forEach(() => {
      const startTile = initialTile();
      brainsRef.current.push(new VaquitaBrain('walking'));
      currentTileRef.current.push(startTile);
      targetTileRef.current.push(startTile);
      currentPosRef.current.push(new THREE.Vector3(startTile[0], getTileTopY(), startTile[1]));
      targetPosRef.current.push(new THREE.Vector3(startTile[0], getTileTopY(), startTile[1]));
    });
  }, [deposits, initialTile]);

  // Dummy object para setMatrixAt
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    const dayProgress = useDayCycleStore.getState().dayProgress;
    deposits.forEach((vaquita, i) => {
      const brain = brainsRef.current[i];
      const currentTile = currentTileRef.current[i];
      const currentPos = currentPosRef.current[i];
      const targetPos = targetPosRef.current[i];

      const state = brain.tick(dayProgress);

      if (state === 'walking') {
        const distance = currentPos.distanceTo(targetPos);
        const speed = 2;
        const step = speed * delta;

        if (distance <= step) {
          const [cx, cz] = currentTile;
          const nextStep = getNextValidTile([cx, cz], isWalkable);

          targetTileRef.current[i] = nextStep;
          targetPos.set(nextStep[0], getTileTopY(), nextStep[1]);

          currentTileRef.current[i] = nextStep;
        }

        currentPos.lerp(targetPos, step);

        if (vaquita.state !== DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY) {
          dummy.position.copy(currentPos);
        }
      } else {
        dummy.position.copy(targetPos);
      }

      dummy.scale.set(0.5, 0.5, 0.5);
      dummy.updateMatrix();
    });
  });

  return (
    <Instances limit={deposits.length}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="pink" />

      <Body bodyColor={bodyColor} spotColor={spotColor} />
      {/*<VaquitaAnimation status={DepositWithdrawalState.DEPOSIT_SUCCESS} direction={[1, 1]} scale={0.5} label={''} />*/}
      {deposits.map((_, i) => (
        <Instance
          key={i}
          position={currentPosRef.current[i] ? currentPosRef.current[i].toArray() : [0, getTileTopY(), 0]}
          onClick={() => onSelect(deposits[i])}
        />
      ))}
    </Instances>
  );
};
