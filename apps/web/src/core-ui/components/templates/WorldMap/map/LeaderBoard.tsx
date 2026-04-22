'use client';

import { ThreeEvent, useThree, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

interface LeaderBoardProps {
  position: [number, number, number];
  onClick?: () => void;
  interactive?: boolean;
  baseY?: number;
  scale?: number;
}

export default function LeaderBoard({
  position,
  onClick,
  interactive = true,
  baseY = 0.01,
  scale = 1,
}: LeaderBoardProps) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [font, setFont] = useState<Font | null>(null);

  useEffect(() => {
    const loader = new FontLoader();
    loader.load(
      '/font/helvetiker_bold.typeface.json',
      (loadedFont) => setFont(loadedFont),
      undefined,
      (error) => console.error('Error loading font:', error)
    );
  }, []);

  // Animación suave
  useFrame(() => {
    if (!groupRef.current) return;
    const targetScale = hovered ? scale * 1.1 : scale; // 10% más grande al pasar el cursor
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.25);
  });

  const group = useMemo(() => {
    const g = new THREE.Group();

    // === Materiales (paleta sobria estilo voxel) ===
    const matBase = new THREE.MeshLambertMaterial({ color: '#5b6b75' }); // base
    const matPodiumA = new THREE.MeshLambertMaterial({ color: '#e28b2e' }); // oro
    const matPodiumB = new THREE.MeshLambertMaterial({ color: '#5fb36a' }); // plata
    const matPodiumC = new THREE.MeshLambertMaterial({ color: '#6bb0c7' }); // bronce
    const matTrophy = new THREE.MeshLambertMaterial({ color: '#f1c40f' }); // copa

    // === Plataforma ===
    const platform = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.8), matBase);
    platform.position.set(0, baseY, 0);
    g.add(platform);

    // === Podios ===
    const hHigh = 0.55;
    const hMid = 0.4;
    const hLow = 0.32;

    const podiumHigh = new THREE.Mesh(new THREE.BoxGeometry(0.36, hHigh, 0.36), matPodiumA);
    podiumHigh.position.set(0, baseY + hHigh / 2, 0);

    const podiumMid = new THREE.Mesh(new THREE.BoxGeometry(0.32, hMid, 0.32), matPodiumB);
    podiumMid.position.set(-0.33, baseY + hMid / 2, 0.02);

    const podiumLow = new THREE.Mesh(new THREE.BoxGeometry(0.3, hLow, 0.3), matPodiumC);
    podiumLow.position.set(0.33, baseY + hLow / 2, 0.02);

    g.add(podiumHigh, podiumMid, podiumLow);

    // === Copa ===
    const trophy = new THREE.Group();

    const tBase = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.14), matTrophy);
    tBase.position.set(0, 0, 0);
    trophy.add(tBase);

    const tStem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), matTrophy);
    tStem.position.set(0, 0.05, 0);
    trophy.add(tStem);

    const cupBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), matTrophy);
    cupBody.position.set(0, 0.05 + 0.19, 0);
    trophy.add(cupBody);

    const cupHollow = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.12, 0.16),
      new THREE.MeshLambertMaterial({ color: '#b38e0a' })
    );
    cupHollow.position.copy(cupBody.position).setY(cupBody.position.y + 0.031);
    trophy.add(cupHollow);

    const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.05), matTrophy);
    handleL.position.set(-0.16, cupBody.position.y, 0);
    const handleR = handleL.clone();
    handleR.position.x = 0.16;

    trophy.add(handleL, handleR);

    trophy.position.set(podiumHigh.position.x, baseY + hHigh + 0.03, podiumHigh.position.z);
    g.add(trophy);

    // === Números frente a los podios (1, 2, 3) ===
    if (font) {
      const textMaterial = new THREE.MeshLambertMaterial({ color: '#E8E8E8' });
      const makeNumber = (label: string, size: number) =>
        new TextGeometry(label, {
          font,
          size: size,
          depth: 0.32,
          curveSegments: 12,
          bevelEnabled: false,
        });

      // Z ligeramente al frente de la plataforma
      const frontZ = -0.1;
      const y = baseY + 0.1;

      const addCenteredText = (geom: TextGeometry, x: number) => {
        geom.computeBoundingBox();
        const bbox = geom.boundingBox!;
        const centerX = (bbox.max.x + bbox.min.x) / 2;
        const mesh = new THREE.Mesh(geom, textMaterial);
        // Evitar que el texto sea interactivo para no retrigger de hover dentro del grupo
        mesh.raycast = (
          _raycaster: THREE.Raycaster,
          _intersects: THREE.Intersection[]
        ) => undefined;
        // Centrar usando el centro real del bounding box
        mesh.position.set(x - centerX, y, frontZ);
        g.add(mesh);
      };

      // 1 frente al podio más alto (centro)
      addCenteredText(makeNumber('1', 0.3), podiumHigh.position.x);
      // 2 frente al podio medio (izquierda)
      addCenteredText(makeNumber('2', 0.16), podiumMid.position.x);
      // 3 frente al podio bajo (derecha)
      addCenteredText(makeNumber('3', 0.14), podiumLow.position.x);
    }

    g.scale.setScalar(scale);

    return g;
  }, [baseY, scale, gl, font]);

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerEnter={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        if (interactive) gl.domElement.style.cursor = 'pointer';
      }}
      onPointerLeave={(e: ThreeEvent<PointerEvent>) => {
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
