'use client';

import { ThreeEvent, useThree, useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

interface VaquitaTrophyProps {
  position: [number, number, number];
  onClick?: () => void;
  interactive?: boolean;
  baseY?: number;
  scale?: number;
}

export default function VaquitaTrophy({
  position,
  onClick,
  interactive = true,
  baseY = 0.01,
  scale = 1,
}: VaquitaTrophyProps) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  // Animación de escala al pasar el cursor
  useFrame(() => {
    if (!groupRef.current) return;
    const target = hovered ? scale * 1.08 : scale;
    groupRef.current.scale.lerp(new THREE.Vector3(target, target, target), 0.12);
  });

  const group = useMemo(() => {
    const g = new THREE.Group();

    // Paleta plana (Lambert)
    const gold = new THREE.MeshLambertMaterial({ color: '#f1c40f' });
    const stoneA = new THREE.MeshLambertMaterial({ color: '#c9bea8' });
    const stoneB = new THREE.MeshLambertMaterial({ color: '#b4a48a' });
    

    // ===== Pedestal (3 niveles) =====
    const pl1 = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.96), stoneB);
    pl1.position.set(0, baseY + 0.04, 0);
    g.add(pl1);

    const pl2 = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.08, 0.77), stoneA);
    pl2.position.set(0, baseY + 0.08 + 0.04, 0);
    g.add(pl2);

    const pl3 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 0.55), stoneB);
    pl3.position.set(0, baseY + 0.08 + 0.08 + 0.13, 0);
    g.add(pl3);

    // Molduras en pendiente (efecto escalonado como bisel)
    const rimMaterial = stoneA;
    const rim1 = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.04, 0.84), rimMaterial);
    rim1.position.set(0, pl2.position.y + 0.08, 0);
    g.add(rim1);
    const rim2 = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.66), stoneB);
    rim2.position.set(0, pl3.position.y + 0.13, 0);
    g.add(rim2);

    // ===== Vaquita (voxelizada) =====
    const cow = new THREE.Group();

    // Cuerpo
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.35), gold);
    body.position.set(0, 0.25, 0);
    cow.add(body);

    // Patas (4)
    const legGeom = new THREE.BoxGeometry(0.08, 0.16, 0.08);
    const legs = [
      [-0.06, 0.16 / 2,  0.11],
      [ 0.06, 0.16 / 2,  0.11],
      [-0.06, 0.16 / 2, -0.11],
      [ 0.06, 0.16 / 2, -0.11],
    ];
    legs.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeom, gold);
      leg.position.set(x as number, y as number, z as number);
      cow.add(leg);
    });

    // Cabeza + hocico
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.16), gold);
    head.position.set(0, 0.22 + 0.04 + 0.15, 0.15);
    cow.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.08), gold);
    snout.position.set(0, head.position.y - 0.05, 0.25);
    cow.add(snout);

    // Narinas y ojos (detalles oscuros)
    const dotMat = new THREE.MeshStandardMaterial({ color: '#b38e0a', metalness: 0.35, roughness: 0.5 });
    const nostrilGeom = new THREE.BoxGeometry(0.02, 0.02, 0.02);
    const n1 = new THREE.Mesh(nostrilGeom, dotMat);
    n1.position.set(-0.04, snout.position.y - 0.005, 0.281);
    const n2 = n1.clone();
    n2.position.x = 0.05;
    cow.add(n1, n2);
    const eyeGeom = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    const e1 = new THREE.Mesh(eyeGeom, dotMat);
    e1.position.set(-0.04, head.position.y + 0.03, 0.22);
    const e2 = e1.clone();
    e2.position.x = 0.05;
    cow.add(e1, e2);

    // Orejas
    const earGeom = new THREE.BoxGeometry(0.1, 0.08, 0.06);
    const earL = new THREE.Mesh(earGeom, gold);
    earL.position.set(-0.10, head.position.y + 0.05, 0.16);
    const earR = earL.clone();
    earR.position.x = 0.10;
    cow.add(earL, earR);

    // Cuernos (estilo “antler” simple)
    const hornGeom = new THREE.BoxGeometry(0.05, 0.10, 0.05);
    const hornL = new THREE.Mesh(hornGeom, gold);
    hornL.position.set(-0.06, head.position.y + 0.12, 0.12);
    const hornR = hornL.clone();
    hornR.position.x = 0.06;
    cow.add(hornL, hornR);

    // Alas (voxelizadas): 4 secciones del mismo color, más arqueadas y separadas
    // const addWing = (side: 'L' | 'R') => {
    //   const wing = new THREE.Group();
    //   const baseX = side === 'L' ? -0.16 : 0.16;
    //   const dir = side === 'L' ? -1 : 1;
    //   // [width, height, depth, offsetX, offsetY, offsetZ]
    //   const feathers: Array<[number, number, number, number, number, number]> = [
    //     [0.18, 0.12, 0.3, 0.02, 0.02, -0.02], // 1: grande base
    //     [0.15, 0.11, 0.06, 0.11, 0.09, -0.06], // 2: media
    //     [0.11, 0.10, 0.05, 0.20, 0.16, -0.10], // 3: pequeña
    //     [0.07, 0.08, 0.05, 0.28, 0.22, -0.14], // 4: punta más fina
    //   ];
    //   feathers.forEach(([w, h, d, ox, oy, oz]) => {
    //     const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gold);
    //     block.position.set(baseX + dir * ox, 0.30 + oy, -0.06 + oz);
    //     wing.add(block);
    //   });
    //   wing.rotation.z = side === 'L' ? 0.28 : -0.28;
    //   wing.rotation.y = side === 'L' ? 0.12 : -0.12;
    //   return wing;
    // };
    // cow.add(addWing('L'));
    // cow.add(addWing('R'));

    // Cola segmentada en zig-zag (4 bloques decrecientes)
    const tail = new THREE.Group();
    const segments: Array<[number, number, number]> = [
      [0.06, 0.10, 0.06],
      [0.05, 0.09, 0.05],
      [0.04, 0.08, 0.04],
      [0.03, 0.07, 0.03],
    ];
    let accX = 0;
    let accY = 0.22;
    let accZ = -0.16;
    segments.forEach(([_w, _h, _d], idx) => {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(_w, _h, _d), gold);
      accX += idx % 2 === 0 ? 0.03 : -0.02;
      accY += 0.03;
      accZ -= 0.05;
      seg.position.set(accX, accY, accZ);
      tail.add(seg);
    });
    cow.add(tail);

    // Ajuste de posición de la vaquita sobre el pedestal superior
    cow.position.set(0, baseY + 0.08 + 0.08 + 0.26, 0);
    g.add(cow);

    // Escala externa
    g.scale.setScalar(scale);
    return g;
  }, [baseY, scale]);

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (interactive) {
          setHovered(true);
          gl.domElement.style.cursor = 'pointer';
        }
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(false);
        gl.domElement.style.cursor = 'default';
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (interactive) onClick?.();
      }}
    >
      <primitive object={group} />
    </group>
  );
}
