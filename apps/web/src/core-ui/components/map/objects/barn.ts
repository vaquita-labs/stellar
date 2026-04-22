'use client';

import { getAddMesh, getY_0 } from '@/core-ui/components/map/helpers';
import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { BoxGeometry } from 'three';

export function getBarnGroup(_: MapObject, __: WorldType) {
  const buildingGroup = new THREE.Group();
  const baseY = 0;

  // Materiales - Colores del granero más vibrantes
  const barnRedMaterial = new THREE.MeshLambertMaterial({ color: '#D94A3D' }); // Rojo más vibrante
  const barnRedDarkMaterial = new THREE.MeshLambertMaterial({ color: '#C53E33' }); // Rojo para detalles
  const roofBrownMaterial = new THREE.MeshLambertMaterial({ color: '#8B5A3C' }); // Marrón para techo
  const whiteMaterial = new THREE.MeshLambertMaterial({ color: '#F5F5F5' }); // Blanco para puerta
  const creamMaterial = new THREE.MeshLambertMaterial({ color: '#E8D4B8' }); // Crema para marcos
  const windowBlueMaterial = new THREE.MeshLambertMaterial({ color: '#A5C9D6' }); // Azul claro para ventanas

  const addMesh = getAddMesh(buildingGroup);
  addMesh(new BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE), roofBrownMaterial, [0, getY_0(TILE_HEIGHT), 0]);

  // Base/Plataforma
  const baseStep = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 1.0), roofBrownMaterial);
  baseStep.castShadow = true;
  baseStep.receiveShadow = true;
  baseStep.position.set(0, baseY, 0);
  buildingGroup.add(baseStep);

  // Cuerpo principal del granero - MÁS ALTO
  const mainBodyHeight = 0.6;
  const mainBodyWidth = 0.85;
  const mainBodyDepth = 0.75;
  const mainBody = new THREE.Mesh(new THREE.BoxGeometry(mainBodyWidth, mainBodyHeight, mainBodyDepth), barnRedMaterial);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  mainBody.position.set(0, baseY + mainBodyHeight / 2 + 0.08, 0);
  buildingGroup.add(mainBody);

  // Líneas horizontales (siding) en el cuerpo - más pronunciadas
  const numLines = 12;
  for (let i = 0; i < numLines; i++) {
    const lineY = baseY + 0.08 + (mainBodyHeight / numLines) * i;
    const sidingLine = new THREE.Mesh(
      new THREE.BoxGeometry(mainBodyWidth + 0.02, 0.015, mainBodyDepth + 0.02),
      barnRedDarkMaterial
    );
    sidingLine.castShadow = true;
    sidingLine.receiveShadow = true;
    sidingLine.position.set(0, lineY, 0);
    buildingGroup.add(sidingLine);
  }

  // VENTANA IZQUIERDA
  const windowWidth = 0.15;
  const windowHeight = 0.12;
  const windowYPos = baseY + 0.08 + mainBodyHeight * 0.8;
  const windowXOffset = 0.25;

  // Ventana izquierda - vidrio
  const leftWindow = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, windowHeight, 0.06), windowBlueMaterial);
  leftWindow.castShadow = true;
  leftWindow.receiveShadow = true;
  leftWindow.position.set(-windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.01);
  buildingGroup.add(leftWindow);

  // Marco ventana izquierda
  const leftWindowFrame = new THREE.Mesh(
    new THREE.BoxGeometry(windowWidth + 0.03, windowHeight + 0.03, 0.04),
    creamMaterial
  );
  leftWindowFrame.castShadow = true;
  leftWindowFrame.receiveShadow = true;
  leftWindowFrame.position.set(-windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.005);
  buildingGroup.add(leftWindowFrame);

  // División en la ventana izquierda (4 paneles)
  const windowDividerH = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, 0.01, 0.07), whiteMaterial);
  windowDividerH.castShadow = true;
  windowDividerH.receiveShadow = true;
  windowDividerH.position.set(-windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.015);
  buildingGroup.add(windowDividerH);

  const windowDividerV = new THREE.Mesh(new THREE.BoxGeometry(0.01, windowHeight, 0.07), whiteMaterial);
  windowDividerV.castShadow = true;
  windowDividerV.receiveShadow = true;
  windowDividerV.position.set(-windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.015);
  buildingGroup.add(windowDividerV);

  // VENTANA DERECHA (espejo de la izquierda)
  const rightWindow = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, windowHeight, 0.06), windowBlueMaterial);
  rightWindow.castShadow = true;
  rightWindow.receiveShadow = true;
  rightWindow.position.set(windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.01);
  buildingGroup.add(rightWindow);

  const rightWindowFrame = new THREE.Mesh(
    new THREE.BoxGeometry(windowWidth + 0.03, windowHeight + 0.03, 0.04),
    creamMaterial
  );
  rightWindowFrame.castShadow = true;
  rightWindowFrame.receiveShadow = true;
  rightWindowFrame.position.set(windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.005);
  buildingGroup.add(rightWindowFrame);

  const windowDividerH2 = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, 0.01, 0.07), whiteMaterial);
  windowDividerH2.castShadow = true;
  windowDividerH2.receiveShadow = true;
  windowDividerH2.position.set(windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.015);
  buildingGroup.add(windowDividerH2);

  const windowDividerV2 = new THREE.Mesh(new THREE.BoxGeometry(0.01, windowHeight, 0.07), whiteMaterial);
  windowDividerV2.castShadow = true;
  windowDividerV2.receiveShadow = true;
  windowDividerV2.position.set(windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.015);
  buildingGroup.add(windowDividerV2);

  // PUERTA con marco beige/crema
  const doorWidth = 0.32;
  const doorHeight = 0.3;
  const doorYPos = baseY + 0.08 + doorHeight / 2;

  // Marco de la puerta (beige/crema)
  const doorFrameWidth = 0.04;
  const doorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(doorWidth + doorFrameWidth, doorHeight + doorFrameWidth, 0.05),
    creamMaterial
  );
  doorFrame.castShadow = true;
  doorFrame.receiveShadow = true;
  doorFrame.position.set(0, doorYPos, -mainBodyDepth / 2 + 0.008);
  buildingGroup.add(doorFrame);

  // Puerta blanca
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.06), whiteMaterial);
  door.castShadow = true;
  door.receiveShadow = true;
  door.position.set(0, doorYPos, -mainBodyDepth / 2 + 0.01);
  buildingGroup.add(door);

  // Líneas verticales en la puerta
  const doorLinePositions = [-0.12, -0.06, 0, 0.06, 0.12];
  doorLinePositions.forEach((x) => {
    const doorLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, doorHeight * 0.95, 0.08),
      new THREE.MeshLambertMaterial({ color: '#E0E0E0' })
    );
    doorLine.castShadow = true;
    doorLine.receiveShadow = true;
    doorLine.position.set(x, doorYPos, -mainBodyDepth / 2 + 0.015);
    buildingGroup.add(doorLine);
  });

  // X/Cruz en la puerta - MÁS GRUESA Y VISIBLE
  const crossThickness = 0.025;
  const crossDepth = 0.08;
  const crossColor = new THREE.MeshLambertMaterial({ color: '#C5B8A0' });

  // Barra diagonal izquierda a derecha (/)
  const crossBar1 = new THREE.Mesh(new THREE.BoxGeometry(crossThickness, doorHeight * 0.85, crossDepth), crossColor);
  crossBar1.castShadow = true;
  crossBar1.receiveShadow = true;
  crossBar1.position.set(0, doorYPos, -mainBodyDepth / 2 + 0.01);
  crossBar1.rotation.z = Math.PI / 4;
  buildingGroup.add(crossBar1);

  // Barra diagonal derecha a izquierda (\)
  const crossBar2 = new THREE.Mesh(new THREE.BoxGeometry(crossThickness, doorHeight * 0.85, crossDepth), crossColor);
  crossBar2.castShadow = true;
  crossBar2.receiveShadow = true;
  crossBar2.position.set(0, doorYPos, -mainBodyDepth / 2 + 0.01);
  crossBar2.rotation.z = -Math.PI / 4;
  buildingGroup.add(crossBar2);

  // TECHO TIPO GAMBREL (curvado) - Estilo granero americano
  const lowerRoofAngle = Math.PI / 3.2; // 60 grados - pendiente pronunciada
  const upperRoofAngle = Math.PI / 7.2; // 30 grados - pendiente suave
  const midRoofHeight = 0.25;
  const topRoofHeight = 0.18;

  // Parte inferior del techo (pendiente pronunciada) - IZQUIERDA
  const lowerRoofWidth = 0.37;
  const lowerLeftRoof = new THREE.Mesh(
    new THREE.BoxGeometry(lowerRoofWidth, 0.08, mainBodyDepth + 0.2),
    roofBrownMaterial
  );
  lowerLeftRoof.castShadow = true;
  lowerLeftRoof.receiveShadow = true;
  lowerLeftRoof.position.set(
    -mainBodyWidth / 2 + lowerRoofWidth / 2 - 0.08,
    baseY + 0.09 + mainBodyHeight + midRoofHeight / 2,
    0
  );
  lowerLeftRoof.rotation.z = lowerRoofAngle;
  buildingGroup.add(lowerLeftRoof);

  // Parte inferior del techo - DERECHA
  const lowerRightRoof = new THREE.Mesh(
    new THREE.BoxGeometry(lowerRoofWidth, 0.08, mainBodyDepth + 0.2),
    roofBrownMaterial
  );
  lowerRightRoof.castShadow = true;
  lowerRightRoof.receiveShadow = true;
  lowerRightRoof.position.set(
    mainBodyWidth / 2 - lowerRoofWidth / 2 + 0.08,
    baseY + 0.09 + mainBodyHeight + midRoofHeight / 2,
    0
  );
  lowerRightRoof.rotation.z = -lowerRoofAngle;
  buildingGroup.add(lowerRightRoof);

  // Parte superior del techo (pendiente suave) - IZQUIERDA
  const upperRoofWidth = 0.25;
  const upperLeftRoof = new THREE.Mesh(
    new THREE.BoxGeometry(upperRoofWidth, 0.08, mainBodyDepth + 0.21),
    roofBrownMaterial
  );
  upperLeftRoof.castShadow = true;
  upperLeftRoof.receiveShadow = true;
  upperLeftRoof.position.set(
    -upperRoofWidth / 2 + 0.02,
    baseY + 0.09 + mainBodyHeight + midRoofHeight + topRoofHeight / 2,
    0
  );
  upperLeftRoof.rotation.z = upperRoofAngle;
  buildingGroup.add(upperLeftRoof);

  // Parte superior del techo - DERECHA
  const upperRightRoof = new THREE.Mesh(
    new THREE.BoxGeometry(upperRoofWidth, 0.08, mainBodyDepth + 0.21),
    roofBrownMaterial
  );
  upperRightRoof.castShadow = true;
  upperRightRoof.receiveShadow = true;
  upperRightRoof.position.set(
    upperRoofWidth / 2 - 0.02,
    baseY + 0.09 + mainBodyHeight + midRoofHeight + topRoofHeight / 2,
    0
  );
  upperRightRoof.rotation.z = -upperRoofAngle;
  buildingGroup.add(upperRightRoof);

  // Bordes del techo en frente y atrás
  const roofEdgeThickness = 0.06;
  const totalRoofHeight = midRoofHeight + topRoofHeight;

  // Triángulo frontal del hastial
  const frontGableHeight = totalRoofHeight;
  const frontGableShape = new THREE.Shape();
  frontGableShape.moveTo(-mainBodyWidth / 2, 0);
  frontGableShape.lineTo(mainBodyWidth / 2, 0);
  frontGableShape.lineTo(mainBodyWidth / 2 - 0.15, midRoofHeight);
  frontGableShape.lineTo(0, frontGableHeight);
  frontGableShape.lineTo(-mainBodyWidth / 2 + 0.15, midRoofHeight);
  frontGableShape.lineTo(-mainBodyWidth / 2, 0);

  const frontGableGeometry = new THREE.ExtrudeGeometry(frontGableShape, {
    depth: roofEdgeThickness,
    bevelEnabled: false,
  });
  const frontGable = new THREE.Mesh(frontGableGeometry, barnRedMaterial);
  frontGable.castShadow = true;
  frontGable.receiveShadow = true;
  frontGable.position.set(0, baseY + 0.08 + mainBodyHeight, -mainBodyDepth / 2 - 0.05);
  buildingGroup.add(frontGable);

  // Líneas horizontales en el hastial frontal
  const gableLines = 8;
  for (let i = 0; i < gableLines; i++) {
    const lineHeight = (frontGableHeight / gableLines) * i;
    const lineWidth = mainBodyWidth * (1 - i / gableLines);
    const gableLine = new THREE.Mesh(
      new THREE.BoxGeometry(lineWidth, 0.012, roofEdgeThickness + 0.01),
      barnRedDarkMaterial
    );
    gableLine.castShadow = true;
    gableLine.receiveShadow = true;
    gableLine.position.set(0, baseY + 0.08 + mainBodyHeight + lineHeight, -mainBodyDepth / 2 - 0.05);
    buildingGroup.add(gableLine);
  }

  // Triángulo trasero
  const backGable = new THREE.Mesh(frontGableGeometry, barnRedMaterial);
  backGable.castShadow = true;
  backGable.receiveShadow = true;
  backGable.position.set(0, baseY + 0.08 + mainBodyHeight, mainBodyDepth / 2 + 0.05);
  backGable.rotation.y = Math.PI;
  buildingGroup.add(backGable);

  return buildingGroup;
}
