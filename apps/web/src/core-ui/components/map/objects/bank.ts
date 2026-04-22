'use client';

import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { BoxGeometry, MeshLambertMaterial } from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TILE_HEIGHT, TILE_SIZE } from '../../templates/WorldMap/vaquita/constants';
import { getAddMesh, getY_0 } from '../helpers';

export function getBankGroup(_: MapObject, __: WorldType, font: Font | null) {
  const baseY = 0;
  const buildingGroup = new THREE.Group();

  // Materiales - Paleta variada de grises estilo Partenón
  const baseGrayMaterial = new MeshLambertMaterial({ color: '#7A8A98' }); // Gris medio para base
  const lightGrayMaterial = new MeshLambertMaterial({ color: '#A0B0C0' }); // Gris claro para columnas
  const darkGrayMaterial = new MeshLambertMaterial({ color: '#4A5560' }); // Gris oscuro para detalles
  const roofDarkMaterial = new MeshLambertMaterial({ color: '#5A6570' }); // Gris plomo techo
  const roofLightMaterial = new MeshLambertMaterial({ color: '#6A7580' }); // Gris plomo claro
  const whiteMaterial = new MeshLambertMaterial({ color: '#E8E8E8' }); // Blanco para letras
  const blackMaterial = new MeshLambertMaterial({ color: '#1A1A1A' }); // Negro para entrada

  const addMesh = getAddMesh(buildingGroup);
  addMesh(new BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE), baseGrayMaterial, [0, getY_0(TILE_HEIGHT), 0]);

  // Base/Plataforma (escalones)
  const baseStep2 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), baseGrayMaterial);
  baseStep2.castShadow = true;
  baseStep2.receiveShadow = true;
  baseStep2.position.set(0, baseY, 0);
  buildingGroup.add(baseStep2);

  const baseStep3 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 1.0), lightGrayMaterial);
  baseStep3.castShadow = true;
  baseStep3.receiveShadow = true;
  baseStep3.position.set(0, baseY + 0.075, 0);
  buildingGroup.add(baseStep3);

  // Piso principal
  const mainFloor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), lightGrayMaterial);
  mainFloor.castShadow = true;
  mainFloor.receiveShadow = true;
  mainFloor.position.set(0, baseY + 0.13, 0);
  buildingGroup.add(mainFloor);

  // Columnas GRANDES estilo Partenón - Frente y laterales
  const columnHeight = 0.3;
  const columnWidth = 0.15; // MUCHO más gruesas
  const columnBaseWidth = 0.18; // Base más gruesa
  const columnCapitalWidth = 0.18; // Capitel más grueso

  // Columnas en frente y laterales
  const columnPositions: [number, number][] = [
    // Frente - 2 columnas
    [-0.3, -0.3], // Columna izquierda del frente
    [0.3, -0.3], // Columna derecha del frente
    // Lado izquierdo - 2 columnas
    [-0.3, 0.01],
    [-0.3, 0.3],
    // Lado derecho - 2 columnas
    [0.3, 0.01],
    [0.3, 0.3],
    // Atrás - 2 columnas
    [-0.1, 0.3],
    [0.1, 0.3],
  ];
  // Building wall
  const buildingWallHeight = 0.8;
  const buildingWallSize = 0.5;
  const buildingWall = new THREE.Mesh(
    new THREE.BoxGeometry(buildingWallSize, buildingWallHeight, buildingWallSize),
    darkGrayMaterial
  );
  buildingWall.castShadow = true;
  buildingWall.receiveShadow = true;
  buildingWall.position.set(0, baseY + 0.16 + 0.06 + buildingWallHeight / 4, 0);
  buildingGroup.add(buildingWall);

  columnPositions.forEach(([x, z]) => {
    // Base de columna (plinto) - GRANDE
    const columnBase = new THREE.Mesh(new THREE.BoxGeometry(columnBaseWidth, 0.06, columnBaseWidth), darkGrayMaterial);
    columnBase.castShadow = true;
    columnBase.receiveShadow = true;
    columnBase.position.set(x, baseY + 0.16 + 0.03, z);
    buildingGroup.add(columnBase);

    // Columna principal - GRANDE
    const column = new THREE.Mesh(new THREE.BoxGeometry(columnWidth, columnHeight, columnWidth), lightGrayMaterial);
    column.castShadow = true;
    column.receiveShadow = true;
    column.position.set(x, baseY + 0.16 + 0.06 + columnHeight / 2, z);
    buildingGroup.add(column);

    // Capitel de columna - GRANDE
    const columnCapital = new THREE.Mesh(
      new THREE.BoxGeometry(columnCapitalWidth, 0.06, columnCapitalWidth),
      darkGrayMaterial
    );
    columnCapital.castShadow = true;
    columnCapital.receiveShadow = true;
    columnCapital.position.set(x, baseY + 0.16 + 0.06 + columnHeight + 0.03, z);
    buildingGroup.add(columnCapital);
  });

  // Friso/banda oscura superior donde va "BANK"
  const friezeHeight = 0.1;
  const friezeSize = 0.85;
  const frieze = new THREE.Mesh(new THREE.BoxGeometry(friezeSize, 0.2, friezeSize), darkGrayMaterial);
  frieze.castShadow = true;
  frieze.receiveShadow = true;
  frieze.position.set(0, baseY + 0.16 + columnHeight + friezeHeight + 0.02, 0);
  buildingGroup.add(frieze);

  // Letrero "BANK" prominente en el frente usando texto 3D
  const signY = baseY + 0.15 + columnHeight + friezeHeight / 2 + 0.06;
  const wallOffset = 0.45;

  // Crear texto 3D "BANK"
  if (font) {
    const textGeometry = new TextGeometry('BANK', {
      font: font,
      size: 0.13,
      depth: 0.02,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.002,
      bevelOffset: 0,
      bevelSegments: 5,
    });

    // Centrar el texto
    textGeometry.computeBoundingBox();
    const textWidth = textGeometry.boundingBox!.max.x - textGeometry.boundingBox!.min.x;

    const bankText = new THREE.Mesh(textGeometry, whiteMaterial);
    bankText.castShadow = true;
    bankText.receiveShadow = true;
    bankText.position.set(-textWidth / 2, signY - 0.03, -wallOffset);
    // Rotar 180 grados para compensar la rotación del edificio completo
    bankText.rotation.y = Math.PI;
    bankText.position.x = textWidth / 2; // Ajustar posición X después de la rotación
    // Evitar que el texto capture eventos de pointer para no romper el hover del grupo
    bankText.raycast = () => undefined;
    buildingGroup.add(bankText);
  }

  // Entrada/puerta oscura
  const doorway = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 0.08), blackMaterial);
  doorway.castShadow = true;
  doorway.receiveShadow = true;
  doorway.position.set(0, baseY + 0.16 + 0.175, -0.25);
  buildingGroup.add(doorway);

  // Base del techo (cornisa)
  const roofBaseHeight = 0.06;

  // Techo de dos aguas estilo Partenón (usando triángulos/prismas)
  const roofHeight = 0.3;
  const roofWidth = 1.1;
  const roofDepth = 0.7;

  // Cara frontal del techo (triángulo)
  const frontRoofShape = new THREE.Shape();
  frontRoofShape.moveTo(-roofWidth / 2, 0);
  frontRoofShape.lineTo(roofWidth / 2, 0);
  frontRoofShape.lineTo(0, roofHeight);
  frontRoofShape.lineTo(-roofWidth / 2, 0);

  // Cara frontal del techo
  const frontRoofGeometry = new THREE.ExtrudeGeometry(frontRoofShape, {
    depth: 0.05,
    bevelEnabled: false,
  });
  const frontRoof = new THREE.Mesh(frontRoofGeometry, roofDarkMaterial);
  frontRoof.castShadow = true;
  frontRoof.receiveShadow = true;
  frontRoof.position.set(0, baseY + 0.16 + columnHeight + friezeHeight + 0.06 + roofBaseHeight, -roofDepth / 2 + 0.7);
  buildingGroup.add(frontRoof);

  // Cara trasera del techo (triángulo)
  const backRoof = new THREE.Mesh(frontRoofGeometry, roofDarkMaterial);
  backRoof.castShadow = true;
  backRoof.receiveShadow = true;
  backRoof.position.set(0, baseY + 0.16 + columnHeight + friezeHeight + 0.06 + roofBaseHeight, roofDepth / 2 - 0.7);
  backRoof.rotation.y = Math.PI;
  buildingGroup.add(backRoof);

  // Lado izquierdo del techo inclinado (paleta de grises variada)
  const sideRoofGeometry = new THREE.BoxGeometry(roofDepth, 0.05, Math.sqrt(roofWidth / 1.5 + roofHeight ** 2));
  const leftRoof = new THREE.Mesh(sideRoofGeometry, roofLightMaterial);
  leftRoof.castShadow = true;
  leftRoof.receiveShadow = true;
  leftRoof.position.set(
    -roofWidth / 4,
    baseY + 0.16 + columnHeight + friezeHeight + 0.06 + roofBaseHeight + roofHeight / 2,
    0
  );
  leftRoof.rotation.z = Math.atan(roofHeight / (roofWidth / 2));
  buildingGroup.add(leftRoof);

  // Lado derecho del techo inclinado
  const rightRoof = new THREE.Mesh(sideRoofGeometry, roofLightMaterial);
  rightRoof.castShadow = true;
  rightRoof.receiveShadow = true;
  rightRoof.position.set(
    roofWidth / 4,
    baseY + 0.16 + columnHeight + friezeHeight + 0.06 + roofBaseHeight + roofHeight / 2,
    0
  );
  rightRoof.rotation.z = -Math.atan(roofHeight / (roofWidth / 2));
  buildingGroup.add(rightRoof);

  return buildingGroup;
}
