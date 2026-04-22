'use client';

import { ThreeEvent, useThree, useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

interface BarnBuildingProps {
  position: [number, number, number];
  onClick?: () => void;
  hasWallet?: boolean;
}

export default function BarnBuilding({ position, onClick, hasWallet }: BarnBuildingProps) {
  const { gl } = useThree();
  const baseY = -0.02;
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const barnBuilding = useMemo(() => {
    const buildingGroup = new THREE.Group();

    // Materiales - Colores del granero más vibrantes
    const barnRedMaterial = new THREE.MeshLambertMaterial({ color: '#D94A3D' }); // Rojo más vibrante
    const barnRedDarkMaterial = new THREE.MeshLambertMaterial({ color: '#C53E33' }); // Rojo para detalles
    const roofBrownMaterial = new THREE.MeshLambertMaterial({ color: '#8B5A3C' }); // Marrón para techo
    const whiteMaterial = new THREE.MeshLambertMaterial({ color: '#F5F5F5' }); // Blanco para puerta
    const creamMaterial = new THREE.MeshLambertMaterial({ color: '#E8D4B8' }); // Crema para marcos
    const windowBlueMaterial = new THREE.MeshLambertMaterial({ color: '#A5C9D6' }); // Azul claro para ventanas

    // Base/Plataforma
    const baseStep = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 1.0), roofBrownMaterial);
    baseStep.position.set(0, baseY, 0);
    buildingGroup.add(baseStep);

    // Cuerpo principal del granero - MÁS ALTO
    const mainBodyHeight = 0.6;
    const mainBodyWidth = 0.85;
    const mainBodyDepth = 0.75;
    const mainBody = new THREE.Mesh(
      new THREE.BoxGeometry(mainBodyWidth, mainBodyHeight, mainBodyDepth),
      barnRedMaterial
    );
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
    leftWindow.position.set(-windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.01);
    buildingGroup.add(leftWindow);

    // Marco ventana izquierda
    const leftWindowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(windowWidth + 0.03, windowHeight + 0.03, 0.04),
      creamMaterial
    );
    leftWindowFrame.position.set(-windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.005);
    buildingGroup.add(leftWindowFrame);

    // División en la ventana izquierda (4 paneles)
    const windowDividerH = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, 0.01, 0.07), whiteMaterial);
    windowDividerH.position.set(-windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.015);
    buildingGroup.add(windowDividerH);

    const windowDividerV = new THREE.Mesh(new THREE.BoxGeometry(0.01, windowHeight, 0.07), whiteMaterial);
    windowDividerV.position.set(-windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.015);
    buildingGroup.add(windowDividerV);

    // VENTANA DERECHA (espejo de la izquierda)
    const rightWindow = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, windowHeight, 0.06), windowBlueMaterial);
    rightWindow.position.set(windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.01);
    buildingGroup.add(rightWindow);

    const rightWindowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(windowWidth + 0.03, windowHeight + 0.03, 0.04),
      creamMaterial
    );
    rightWindowFrame.position.set(windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.005);
    buildingGroup.add(rightWindowFrame);

    const windowDividerH2 = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, 0.01, 0.07), whiteMaterial);
    windowDividerH2.position.set(windowXOffset, windowYPos, -mainBodyDepth / 2 - 0.015);
    buildingGroup.add(windowDividerH2);

    const windowDividerV2 = new THREE.Mesh(new THREE.BoxGeometry(0.01, windowHeight, 0.07), whiteMaterial);
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
    doorFrame.position.set(0, doorYPos, -mainBodyDepth / 2 + 0.008);
    buildingGroup.add(doorFrame);

    // Puerta blanca
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.06), whiteMaterial);
    door.position.set(0, doorYPos, -mainBodyDepth / 2 + 0.01);
    buildingGroup.add(door);

    // Líneas verticales en la puerta
    const doorLinePositions = [-0.12, -0.06, 0, 0.06, 0.12];
    doorLinePositions.forEach((x) => {
      const doorLine = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, doorHeight * 0.95, 0.08),
        new THREE.MeshLambertMaterial({ color: '#E0E0E0' })
      );
      doorLine.position.set(x, doorYPos, -mainBodyDepth / 2 + 0.015);
      buildingGroup.add(doorLine);
    });

    // X/Cruz en la puerta - MÁS GRUESA Y VISIBLE
    const crossThickness = 0.025;
    const crossDepth = 0.08;
    const crossColor = new THREE.MeshLambertMaterial({ color: '#C5B8A0' });

    // Barra diagonal izquierda a derecha (/)
    const crossBar1 = new THREE.Mesh(new THREE.BoxGeometry(crossThickness, doorHeight * 0.85, crossDepth), crossColor);
    crossBar1.position.set(0, doorYPos, -mainBodyDepth / 2 + 0.01);
    crossBar1.rotation.z = Math.PI / 4;
    buildingGroup.add(crossBar1);

    // Barra diagonal derecha a izquierda (\)
    const crossBar2 = new THREE.Mesh(new THREE.BoxGeometry(crossThickness, doorHeight * 0.85, crossDepth), crossColor);
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
      gableLine.position.set(0, baseY + 0.08 + mainBodyHeight + lineHeight, -mainBodyDepth / 2 - 0.05);
      buildingGroup.add(gableLine);
    }

    // Triángulo trasero
    const backGable = new THREE.Mesh(frontGableGeometry, barnRedMaterial);
    backGable.position.set(0, baseY + 0.08 + mainBodyHeight, mainBodyDepth / 2 + 0.05);
    backGable.rotation.y = Math.PI;
    buildingGroup.add(backGable);

    return buildingGroup;
  }, [baseY]);

  // Animación de hover (escala) similar a otros edificios
  useFrame(() => {
    if (!groupRef.current) return;
    const targetScale = hovered ? 1.1 : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.25);
  });

  return (
    <group
      ref={groupRef}
      position={position}
      // rotation is 4.7 because the barn is in the ground and 0 generated a awful visual effect
      rotation={[0, 4.7, 0]}
      onPointerEnter={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        gl.domElement.style.cursor = hasWallet ? 'pointer' : 'default';
      }}
      onPointerLeave={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(false);
        gl.domElement.style.cursor = 'default';
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <primitive object={barnBuilding} />
    </group>
  );
}
