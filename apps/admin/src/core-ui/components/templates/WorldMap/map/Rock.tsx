'use client';

// import { useState } from "react";
// import { useFrame } from "@react-three/fiber";
import { getTileTopY } from '@/core-ui/helpers/map';

interface RockProps {
  position: [number, number, number];
  beingWorked: boolean;
  variant: number;
}

// type Debris = {
//   id: string;
//   position: [number, number, number];
//   velocity: [number, number, number];
// };

export default function Rock({ position, variant }: RockProps) {
  const baseY = getTileTopY();
  const mainRockHeight = 1;
  // const [debris, setDebris] = useState<Debris[]>([]);
  // const spawnTimer = useRef(0);
  // const gravity = 9.8;

  // useFrame((_, delta) => {
  //   // spawn each second
  //   if (beingWorked) {
  //     spawnTimer.current += delta;
  //     if (spawnTimer.current >= 1) {
  //       spawnTimer.current = 0;

  //       const angle = Math.random() * Math.PI * 2;
  //       const speed = 1 + Math.random() * 0.3;
  //       const vx = Math.cos(angle) * speed;
  //       const vz = Math.sin(angle) * speed;
  //       const vy = 2.5 + Math.random() * 2;

  //       setDebris((prev) => [
  //         ...prev,
  //         {
  //           id:
  //             typeof crypto !== "undefined" && crypto.randomUUID
  //               ? crypto.randomUUID()
  //               : Math.random().toString(36).substring(2, 10),
  //           position: [0, mainRockHeight, 0],
  //           velocity: [vx, vy, vz],
  //         },
  //       ]);
  //     }
  //   } else {
  //     spawnTimer.current = 0;
  //   }

  //   // update each cube
  //   setDebris(
  //     (prev) =>
  //       prev
  //         .map((d) => {
  //           const [x, y, z] = d.position;
  //           const [vx, vy, vz] = d.velocity;

  //           const newVy = vy - gravity * delta;

  //           return {
  //             ...d,
  //             position: [x + vx * delta, y + newVy * delta, z + vz * delta] as [
  //               number,
  //               number,
  //               number
  //             ],
  //             velocity: [vx, newVy, vz] as [number, number, number],
  //           };
  //         })
  //         .filter((d) => d.position[1] > 0) // remove when hits ground
  //   );
  // });
  if (variant === 0) {
    return (
      <group position={[position[0], baseY - mainRockHeight / 2, position[2]]}>
        <mesh castShadow position={[0, mainRockHeight / 2, 0]} receiveShadow>
          <boxGeometry args={[1, mainRockHeight, 1]} />
          <meshStandardMaterial color="#A4876A" />
        </mesh>

        {/* Parabolic debris */}
        {/* {debris.map((d) => (
          <mesh castShadow key={d.id} position={d.position} scale={0.8}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="#A4876A" />
          </mesh>
        ))} */}
      </group>
    );
  }
  if (variant === 1) {
    return (
      <group position={[position[0], baseY - mainRockHeight / 2, position[2]]}>
        <mesh castShadow position={[0, mainRockHeight / 2, 0.2]} receiveShadow>
          <boxGeometry args={[0.5, mainRockHeight, 0.5]} />
          <meshStandardMaterial color="#A4876A" />
        </mesh>
        <mesh castShadow position={[0, mainRockHeight / 4, 0]} receiveShadow>
          <boxGeometry args={[1, mainRockHeight / 2, 1]} />
          <meshStandardMaterial color="#A4876A" />
        </mesh>
      </group>
    );
  }
  if (variant === 2) {
    return (
      <group position={[position[0], baseY - mainRockHeight / 2, position[2]]}>
        <mesh castShadow position={[0, mainRockHeight / 2, 0.2]} receiveShadow>
          <boxGeometry args={[1, mainRockHeight, 1]} />
          <meshStandardMaterial color="#A4876A" />
        </mesh>
      </group>
    );
  }
  if (variant === 3) {
    return (
      <group position={[position[0], baseY - mainRockHeight / 2, position[2]]}>
        <mesh castShadow position={[0, mainRockHeight / 2, 0]} receiveShadow>
          <boxGeometry args={[1, mainRockHeight, 1]} />
          <meshStandardMaterial color="#696969" />
        </mesh>
        <mesh castShadow position={[-0.2, mainRockHeight / 4, -0.2]} receiveShadow>
          <boxGeometry args={[0.4, 2, 0.4]} />
          <meshStandardMaterial color="#696969" />
        </mesh>
      </group>
    );
  }
  if (variant === 4) {
    return (
      <group position={[position[0], baseY - mainRockHeight / 2, position[2]]}>
        <mesh castShadow position={[0, mainRockHeight / 2, 0]} receiveShadow>
          <boxGeometry args={[1, mainRockHeight + 0.3, 1]} />
          <meshStandardMaterial color="#696969" />
        </mesh>
      </group>
    );
  }
}
