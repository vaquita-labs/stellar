'use client';

import { getTileTopY } from '@/core-ui/helpers/map';
import { WorldType } from '@/core-ui/types/map';
import { useRef } from 'react';
import * as THREE from 'three';

interface TreeProps {
  position: [number, number, number];
  beingWorked: boolean;
  variant: number;
  styleMap: WorldType;
}

type Debris = {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
};

export default function Tree({ position, variant, styleMap }: TreeProps) {
  const trunkRef = useRef<THREE.Mesh>(null);
  const leavesRef = useRef<THREE.Mesh>(null);
  const debrisRef = useRef<Debris[]>([]);
  // const spawnTimer = useRef(0);
  // const gravity = 9.8;
  // const mainTreeHeight = 1;

  const baseY = getTileTopY();

  // useFrame((_, delta) => {
  //   if (beingWorked) {
  //     spawnTimer.current += delta;
  //     if (spawnTimer.current >= 1) {
  //       spawnTimer.current = 0;
  //       const angle = Math.random() * Math.PI * 2;
  //       const speed = 1 + Math.random() * 0.3;
  //       const vx = Math.cos(angle) * speed;
  //       const vz = Math.sin(angle) * speed;
  //       const vy = 2.5 + Math.random() * 2;

  //       const id =
  //         crypto?.randomUUID?.() ?? Math.random().toString(36).substring(2, 10);
  //       debrisRef.current.push({
  //         id,
  //         position: [0, mainTreeHeight, 0],
  //         velocity: [vx, vy, vz],
  //       });
  //     }
  //   } else {
  //     spawnTimer.current = 0;
  //   }

  //   debrisRef.current = debrisRef.current
  //     .map((d): Debris => {
  //       const [x, y, z] = d.position;
  //       const [vx, vy, vz] = d.velocity;
  //       const newVy = vy - gravity * delta;

  //       return {
  //         ...d,
  //         position: [x + vx * delta, y + newVy * delta, z + vz * delta],
  //         velocity: [vx, newVy, vz],
  //       };
  //     })
  //     .filter((d): d is Debris => d.position[1] > 0);
  // });

  const renderDebris = () =>
    debrisRef.current.map((d) => (
      <mesh key={d.id} position={d.position} scale={0.8} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#9FFD53" />
      </mesh>
    ));

  const renderVariant0 = () => (
    <>
      <mesh ref={trunkRef} position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.2, 1, 0.2]} />
        <meshStandardMaterial color="brown" />
      </mesh>
      <mesh ref={leavesRef} position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.6, 0.5, 0.6]} />
        <meshStandardMaterial color="#9FFD53" />
      </mesh>
      <mesh ref={leavesRef} position={[0, baseY + 0.3, 0]} castShadow>
        <boxGeometry args={[0.4, 0.5, 0.4]} />
        <meshStandardMaterial color="#9FFD53" />
      </mesh>
      <mesh ref={leavesRef} position={[0, baseY + 0.6, 0]} castShadow>
        <boxGeometry args={[0.2, 0.3, 0.2]} />
        <meshStandardMaterial color="#9FFD53" />
      </mesh>
    </>
  );

  const renderVariant1 = () => (
    <>
      <mesh ref={trunkRef} position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.2, 1, 0.2]} />
        <meshStandardMaterial color="brown" />
      </mesh>
      <mesh ref={leavesRef} position={[0, baseY + 0.2, 0]} castShadow>
        <boxGeometry args={[0.6, 0.7, 0.6]} />
        <meshStandardMaterial color="#9FFD53" />
      </mesh>
    </>
  );

  const renderVariant2 = () => (
    <>
      <mesh ref={trunkRef} position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.2, 1, 0.2]} />
        <meshStandardMaterial color="brown" />
      </mesh>
      <mesh ref={leavesRef} position={[0, baseY + 0.2, 0]} castShadow>
        <boxGeometry args={[0.6, 0.7, 0.6]} />
        <meshStandardMaterial color="#9FFD53" />
      </mesh>
      <mesh ref={leavesRef} position={[0.2, baseY + 0.4, 0.2]} castShadow>
        <boxGeometry args={[0.4, 0.7, 0.5]} />
        <meshStandardMaterial color="#9FFD53" />
      </mesh>
    </>
  );
  const renderVariant3 = () => (
    <>
      {/* Tronco central */}
      <mesh position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.2, 1, 0.2]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>
      {/* Brazo derecho */}
      <mesh position={[0.2, baseY + 0.2, 0]} castShadow>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>
      {/* Brazo izquierdo */}
      <mesh position={[-0.2, baseY + 0.15, 0]} castShadow>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>
      <mesh position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.4, 0.1, 0.1]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>
    </>
  );

  const renderVariant4 = () => (
    <>
      {/* Tronco */}
      <mesh position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.15, 1, 0.15]} />
        <meshStandardMaterial color="#A4876A" />
      </mesh>
      {/* Hojas - estilo voxel tipo cruz */}
      <mesh position={[0, baseY + 0.5, 0.25]} castShadow>
        <boxGeometry args={[0.2, 0.05, 0.5]} />
        <meshStandardMaterial color="#5CA904" />
      </mesh>
      <mesh position={[0, baseY + 0.5, -0.25]} castShadow>
        <boxGeometry args={[0.2, 0.05, 0.5]} />
        <meshStandardMaterial color="#5CA904" />
      </mesh>
      <mesh position={[0.25, baseY + 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.05, 0.2]} />
        <meshStandardMaterial color="#5CA904" />
      </mesh>
      <mesh position={[-0.25, baseY + 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.05, 0.2]} />
        <meshStandardMaterial color="#5CA904" />
      </mesh>
    </>
  );
  const renderVariant5 = () => (
    <>
      {/* Tronco central */}
      <mesh position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.3, 1, 0.3]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>

      {/* Brazo derecho superior */}
      <mesh position={[0.3, baseY + 0.2, 0]} castShadow>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>

      {/* Brazo izquierdo inferior */}
      <mesh position={[-0.3, baseY - 0.1, 0]} castShadow>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>

      <mesh position={[0, baseY - 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.1, 0.1]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>

      {/* Base ancha en forma de cruz */}
      <mesh position={[0, baseY - 0.5, 0]} castShadow>
        <boxGeometry args={[0.4, 0.1, 0.1]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>
      <mesh position={[0, baseY - 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 0.1, 0.4]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>
    </>
  );
  const renderVariant6 = () => (
    <group scale={0.8} position={[0, baseY-0.65, 0]}>
      {/* Cuerpo principal de la calabaza */}
      <mesh position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial color="#FF6B1A" />
      </mesh>

      {/* Ojo izquierdo */}
      <group position={[-0.2, baseY + 0.18, 0.35]}>
        <mesh position={[0.01, 0.02, 0]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[0.01, -0.05, 0]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[0.1, -0.05, 0]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
      </group>

      {/* Ojo derecho */}
      <group position={[0.15, baseY + 0.18, 0.35]} castShadow>
        <mesh position={[0.06, 0.02, 0]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[-0.03, -0.05, 0]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[0.06, -0.05, 0]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
      </group>

      {/* Boca - dientes */}
      <group position={[0, 0.12, 0.04]} castShadow>
        <mesh position={[-0.19, baseY - 0.15, 0.31]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[-0.1, baseY - 0.24, 0.31]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[0, baseY - 0.15, 0.31]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[0.1, baseY - 0.24, 0.31]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[0.2, baseY - 0.15, 0.31]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
      </group>
    </group>
  );

  const renderVariant7 = () => (
    <group position={[0, baseY-0.65, 0]}>
      {/* Tronco principal seco - color gris/marrón apagado */}
      <mesh position={[0, baseY, 0]} castShadow>
        <boxGeometry args={[0.2, 0.8, 0.2]} />
        <meshStandardMaterial color="#5C4F47" />
      </mesh>

      <mesh position={[0.2, baseY + 0.3, 0]} castShadow>
        <boxGeometry args={[0.4, 0.1, 0.1]} />
        <meshStandardMaterial color="#5C4F47" />
      </mesh>

      {/* Rama izquierda quebrada */}
      <mesh position={[-0.2, baseY + 0.15, 0]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.1]} />
        <meshStandardMaterial color="#5C4F47" />
      </mesh>

      {/* Punta del tronco rota */}
      <mesh position={[0.05, baseY + 0.5, 0]} castShadow>
        <boxGeometry args={[0.15, 0.2, 0.15]} />
        <meshStandardMaterial color="#5C4F47" />
      </mesh>
    </group>
  );
  if (styleMap === WorldType.FOREST) {
    return (
      <group position={position} rotation={[0, 1, 0]}>
        {variant === 0 && renderVariant0()}
        {variant === 1 && renderVariant1()}
        {variant === 2 && renderVariant2()}
        {renderDebris()}
      </group>
    );
  } else if (styleMap === WorldType.DESERT) {
    return (
      <group position={position} rotation={[0, 1, 0]}>
        {variant === 0 && renderVariant3()}
        {variant === 1 && renderVariant4()}
        {variant === 2 && renderVariant5()}
        {renderDebris()}
      </group>
    );
  }
  if (styleMap === WorldType.VOLCANO) {
    return (
      <group position={position} rotation={[0, 1, 0]}>
        {variant === 0 && renderVariant6()}
        {variant === 1 && renderVariant7()}
        {variant === 2 && renderVariant7()}
      </group>
    );
  }
}
