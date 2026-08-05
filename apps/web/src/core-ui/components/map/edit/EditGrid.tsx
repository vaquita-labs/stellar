'use client';

import { useMapStore } from '@/core-ui/stores';
import { MAP_SIZE } from '@/core-ui/components/map/constants';
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { disposeObject } from '../helpers';

export const EditGrid = () => {
  const editMode = useMapStore((store) => store.editMode);

  const gridGroup = useMemo(() => {
    if (!editMode) return null;

    const group = new THREE.Group();

    // Material para las líneas de la cuadrícula (negras y opacas)
    const gridLineMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      opacity: 0.9,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });

    // Material para el borde exterior (más grueso y completamente opaco)
    const borderMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      opacity: 1,
      transparent: false,
      depthTest: true,
      depthWrite: false
    });

    // Los tiles están centrados en enteros desde 0 a MAP_SIZE-1
    // La cuadrícula debe ir desde -0.5 a MAP_SIZE - 0.5 para alinearse con los bordes de los tiles
    const minX = -0.5;
    const maxX = MAP_SIZE - 0.5;
    const minZ = -0.5;
    const maxZ = MAP_SIZE - 0.5;
    // Apenas DEBAJO del tope de los tiles (y=0): los tiles ocupados ocultan la
    // línea con su propio sólido (depthTest) y la cuadrícula solo se ve en las
    // celdas vacías donde se puede colocar. Por encima (0.02) se dibujaba
    // cruzando el pasto, como una línea pegada sobre los objetos — y durante la
    // animación de colocación (escala 0.5 → 1) desbordaba el objeto chico.
    const gridY = -0.02;

    // Todas las líneas interiores en UN solo LineSegments (pares de puntos =
    // un segmento cada dos vértices): 1 draw call en vez de 30 Line sueltas.
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= MAP_SIZE; i++) {
      const x = i - 0.5;
      points.push(new THREE.Vector3(x, gridY, minZ), new THREE.Vector3(x, gridY, maxZ));
    }
    for (let i = 0; i <= MAP_SIZE; i++) {
      const z = i - 0.5;
      points.push(new THREE.Vector3(minX, gridY, z), new THREE.Vector3(maxX, gridY, z));
    }
    const gridGeometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.LineSegments(gridGeometry, gridLineMaterial));

    // Borde exterior más grueso para marcar claramente los límites del mapa
    const borderGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(minX, gridY, minZ),
      new THREE.Vector3(maxX, gridY, minZ),
      new THREE.Vector3(maxX, gridY, maxZ),
      new THREE.Vector3(minX, gridY, maxZ),
      new THREE.Vector3(minX, gridY, minZ)
    ]);
    group.add(new THREE.Line(borderGeometry, borderMaterial));

    // Configurar renderOrder para que la cuadrícula se renderice por encima
    group.renderOrder = 1000;

    return group;
  }, [editMode]);

  // Liberar geometrías/materiales al salir de edición o desmontar (antes las
  // 31 líneas quedaban vivas por sesión de edición).
  useEffect(() => {
    if (!gridGroup) return;
    return () => disposeObject(gridGroup);
  }, [gridGroup]);

  if (!gridGroup) return null;

  return <primitive object={gridGroup} renderOrder={1000} />;
};
