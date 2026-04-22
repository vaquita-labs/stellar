'use client';

import { getAddMesh, getY_0 } from '@/core-ui/components/map/helpers';
import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { BoxGeometry } from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';

export function getLeaderboardGroup(_: MapObject, __: WorldType, font: Font | null) {
  const bankGroup = new THREE.Group();
  const scale = 1;
  const baseY = 0;

  // === Materiales (paleta sobria estilo voxel) ===
  const matBase = new THREE.MeshLambertMaterial({ color: '#5b6b75' }); // base
  const matPodiumA = new THREE.MeshLambertMaterial({ color: '#e28b2e' }); // oro
  const matPodiumB = new THREE.MeshLambertMaterial({ color: '#5fb36a' }); // plata
  const matPodiumC = new THREE.MeshLambertMaterial({ color: '#6bb0c7' }); // bronce
  const matTrophy = new THREE.MeshLambertMaterial({ color: '#f1c40f' }); // copa

  const addMesh = getAddMesh(bankGroup);
  addMesh(new BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE), matBase, [0, getY_0(TILE_HEIGHT), 0]);

  // === Plataforma ===
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.8), matBase);
  platform.castShadow = true;
  platform.receiveShadow = true;
  platform.position.set(0, baseY, 0);
  bankGroup.add(platform);

  // === Podios ===
  const hHigh = 0.55;
  const hMid = 0.4;
  const hLow = 0.32;

  const podiumHigh = new THREE.Mesh(new THREE.BoxGeometry(0.36, hHigh, 0.36), matPodiumA);
  podiumHigh.castShadow = true;
  podiumHigh.receiveShadow = true;
  podiumHigh.position.set(0, baseY + hHigh / 2, 0);

  const podiumMid = new THREE.Mesh(new THREE.BoxGeometry(0.32, hMid, 0.32), matPodiumB);
  podiumMid.castShadow = true;
  podiumMid.receiveShadow = true;
  podiumMid.position.set(-0.33, baseY + hMid / 2, 0.02);

  const podiumLow = new THREE.Mesh(new THREE.BoxGeometry(0.3, hLow, 0.3), matPodiumC);
  podiumLow.castShadow = true;
  podiumLow.receiveShadow = true;
  podiumLow.position.set(0.33, baseY + hLow / 2, 0.02);

  bankGroup.add(podiumHigh, podiumMid, podiumLow);

  // === Copa ===
  const trophy = new THREE.Group();

  const tBase = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.14), matTrophy);
  tBase.castShadow = true;
  tBase.receiveShadow = true;
  tBase.position.set(0, 0, 0);
  trophy.add(tBase);

  const tStem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), matTrophy);
  tStem.castShadow = true;
  tStem.receiveShadow = true;
  tStem.position.set(0, 0.05, 0);
  trophy.add(tStem);

  const cupBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), matTrophy);
  cupBody.castShadow = true;
  cupBody.receiveShadow = true;
  cupBody.position.set(0, 0.05 + 0.19, 0);
  trophy.add(cupBody);

  const cupHollow = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.16),
    new THREE.MeshLambertMaterial({ color: '#b38e0a' })
  );
  cupHollow.castShadow = true;
  cupHollow.receiveShadow = true;
  cupHollow.position.copy(cupBody.position).setY(cupBody.position.y + 0.031);
  trophy.add(cupHollow);

  const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.05), matTrophy);
  handleL.castShadow = true;
  handleL.receiveShadow = true;
  handleL.position.set(-0.16, cupBody.position.y, 0);
  const handleR = handleL.clone();
  handleR.castShadow = true;
  handleR.receiveShadow = true;
  handleR.position.x = 0.16;

  trophy.add(handleL, handleR);

  trophy.position.set(podiumHigh.position.x, baseY + hHigh + 0.03, podiumHigh.position.z);
  bankGroup.add(trophy);

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
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Evitar que el texto sea interactivo para no retrigger de hover dentro del grupo
      mesh.raycast = () => undefined;
      // Centrar usando el centro real del bounding box
      mesh.position.set(x - centerX, y, frontZ);
      bankGroup.add(mesh);
    };

    // 1 frente al podio más alto (centro)
    addCenteredText(makeNumber('1', 0.3), podiumHigh.position.x);
    // 2 frente al podio medio (izquierda)
    addCenteredText(makeNumber('2', 0.16), podiumMid.position.x);
    // 3 frente al podio bajo (derecha)
    addCenteredText(makeNumber('3', 0.14), podiumLow.position.x);
  }

  bankGroup.scale.setScalar(scale);

  return bankGroup;
}
