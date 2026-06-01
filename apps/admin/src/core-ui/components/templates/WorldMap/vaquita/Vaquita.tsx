'use client';

import { getTileTopY } from '@/core-ui/helpers/map';
import { DepositWithdrawalState } from '@/core-ui/types';
import { Instance, Instances } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useMap, useTerrain } from '../../../../hooks';
import { competitiveMap } from '../map/competitiveMap';
import { Body } from '../vaquita/animations/parts';
import { getNextValidTile } from './helpers';
import { VaquitaControllerProps } from './types';
import { VaquitaAnimation } from './VaquitaAnimation';
import { VaquitaBrain } from './VaquitaBrain';

export const Vaquita = ({ vaquita, onSelect, tokenSymbol }: VaquitaControllerProps) => {
  const ref = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const { tileTypes } = useTerrain();

  const [scale, setScale] = useState(0.5);
  const [direction, setDirection] = useState<[number, number]>([1, 1]);

  const { isWalkable } = useMap(competitiveMap);

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
          const nextStep = getNextValidTile([cx, cz], tileTypes);

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

  const label = `${vaquita.amount} ${tokenSymbol}`;

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
      <VaquitaAnimation status={vaquita.state} direction={direction} scale={scale} label={label} />
    </group>
  );
};

const baseColor = '#fff3e1';
const bodyColor = '#E4D9C9';
const spotColor = '#6f4e37';
const helmetColor = '#FBA71A';
const noseColor = '#e88e29';
const hoofColor = '#3a2b1b';

interface VaquitasInstancedProps {
  deposits: VaquitaControllerProps['vaquita'][];
  tokenSymbol: string;
  onSelect: (v: VaquitaControllerProps['vaquita']) => void;
}

// FOLLOWING NO WORKS
export const VaquitasInstanced = ({ deposits, tokenSymbol, onSelect }: VaquitasInstancedProps) => {
  // const meshRef = useRef<THREE.InstancedMesh>(null);
  const { tileTypes } = useTerrain();
  const { isWalkable } = useMap(competitiveMap);

  // Generador de posiciones iniciales
  const initialTile = (): [number, number] => {
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * 8) + 1;
      const z = Math.floor(Math.random() * 8) + 1;
      if (isWalkable(x, z)) return [x, z];
    }
    return [0, 0];
  };

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
      brainsRef.current.push(new VaquitaBrain('walking', startTile));
      currentTileRef.current.push(startTile);
      targetTileRef.current.push(startTile);
      currentPosRef.current.push(new THREE.Vector3(startTile[0], getTileTopY(), startTile[1]));
      targetPosRef.current.push(new THREE.Vector3(startTile[0], getTileTopY(), startTile[1]));
    });
  }, [deposits, isWalkable]);

  // Dummy object para setMatrixAt
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    deposits.forEach((vaquita, i) => {
      const brain = brainsRef.current[i];
      const currentTile = currentTileRef.current[i];
      const targetTile = targetTileRef.current[i];
      const currentPos = currentPosRef.current[i];
      const targetPos = targetPosRef.current[i];

      // Si no está durmiendo ni trabajando
      if (!(brain.state === 'working' || brain.state === 'sleeping')) {
        if (brain.shouldChangeState()) {
          brain.state = brain.nextState();
        }

        if (brain.state === 'walking') {
          const distance = currentPos.distanceTo(targetPos);
          const speed = 2;
          const step = speed * delta;

          if (distance <= step) {
            const [cx, cz] = currentTile;
            const nextStep = getNextValidTile([cx, cz], tileTypes);

            targetTileRef.current[i] = nextStep;
            targetPos.set(nextStep[0], getTileTopY(), nextStep[1]);

            brain.updatePosition(nextStep);
            currentTileRef.current[i] = nextStep;
          }

          currentPos.lerp(targetPos, step);

          if (vaquita.state !== DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY) {
            dummy.position.copy(currentPos);
          }
        } else {
          dummy.position.copy(targetPos);
        }
      }

      // Escala fija (puedes variar por vaquita si quieres)
      dummy.scale.set(0.5, 0.5, 0.5);

      // Aplicas transformaciones y setMatrixAt
      dummy.updateMatrix();
      // meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    // meshRef.current!.instanceMatrix.needsUpdate = true;
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
