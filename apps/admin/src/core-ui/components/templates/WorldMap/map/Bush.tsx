'use client';

import { getTileTopY } from '@/core-ui/helpers/map';
import { WorldType } from '@/core-ui/types/map';
import { useMemo } from 'react';
import * as THREE from 'three';

interface BushProps {
  position: [number, number, number];
  styleMap: WorldType;
}

export default function Bush({ position, styleMap }: BushProps) {
  const baseY = 0.2;

  const forestBush = useMemo(() => {
    const bushGroup = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: '#72924C' });

    const bushData: { pos: [number, number]; height: number }[] = [
      { pos: [-0.22, -0.18], height: 0.45 },
      { pos: [0.03, -0.2], height: 0.5 },
      { pos: [0.18, 0.1], height: 0.6 },
      { pos: [-0.15, 0.2], height: 0.55 },
      { pos: [0.3, 0.3], height: 0.5 },
      { pos: [0.4, 0.1], height: 0.6 },
    ];

    for (const { pos, height } of bushData) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.1, height, 0.1), material);
      box.position.set(pos[0], height / 2, pos[1]);
      bushGroup.add(box);
    }

    return bushGroup;
  }, []);

  const desertRocks = useMemo(() => {
    const rockGroup = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: '#A4876A' });
    const material2 = new THREE.MeshLambertMaterial({ color: '#8B7355' });

    // Roca grande
    const rock1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), material);
    rock1.position.set(0, baseY - 0.155, 0);
    rockGroup.add(rock1);

    // Roca mediana
    const rock2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), material2);
    rock2.position.set(0.25, baseY - 0.15, 0.15);
    rockGroup.add(rock2);

    // Roca pequeña
    const rock3 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.15), material);
    rock3.position.set(-0.2, baseY - 0.15, 0.2);
    rockGroup.add(rock3);

    return rockGroup;
  }, [baseY]);

  const volcanoSkull = useMemo(() => {
    const skullGroup = new THREE.Group();
    const boneMaterial = new THREE.MeshLambertMaterial({ color: '#E8E8E8' });
    const darkMaterial = new THREE.MeshLambertMaterial({ color: '#000000' });

    // Cabeza de la calavera
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), boneMaterial);
    skull.position.set(0, baseY, 0);
    skullGroup.add(skull);

    // Ojo izquierdo
    const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), darkMaterial);
    eyeLeft.position.set(-0.1, baseY, 0.21);
    skullGroup.add(eyeLeft);

    // Ojo derecho
    const eyeRight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), darkMaterial);
    eyeRight.position.set(0.1, baseY, 0.21);
    skullGroup.add(eyeRight);

    // Nariz
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.05), darkMaterial);
    nose.position.set(0, baseY-0.1, 0.21);
    skullGroup.add(nose);
    

    return skullGroup;
  }, [baseY]);

  if (styleMap === WorldType.FOREST) {
    return <primitive object={forestBush} position={position} />;
  } else if (styleMap === WorldType.DESERT) {
    return <primitive object={desertRocks} position={position} />;
  } else if (styleMap === WorldType.VOLCANO) {
    return <primitive object={volcanoSkull} position={position} />;
  }

  return null;
}
