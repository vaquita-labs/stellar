'use client';

import { useMapStore } from '../../stores';
import { MAP_SIZE } from '../templates/WorldMap/vaquita/constants';
import * as THREE from 'three';
import { useMemo } from 'react';

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
    const gridY = 0.02; // Ligeramente por encima del suelo para evitar z-fighting y ser más visible
    
    // Líneas verticales (paralelas al eje Z) - una por cada posición de tile + bordes
    for (let i = 0; i <= MAP_SIZE; i++) {
      const x = i - 0.5;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, gridY, minZ),
        new THREE.Vector3(x, gridY, maxZ)
      ]);
      const line = new THREE.Line(geometry, gridLineMaterial);
      group.add(line);
    }
    
    // Líneas horizontales (paralelas al eje X) - una por cada posición de tile + bordes
    for (let i = 0; i <= MAP_SIZE; i++) {
      const z = i - 0.5;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(minX, gridY, z),
        new THREE.Vector3(maxX, gridY, z)
      ]);
      const line = new THREE.Line(geometry, gridLineMaterial);
      group.add(line);
    }

    // Borde exterior más grueso para marcar claramente los límites del mapa
    const borderGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(minX, gridY, minZ),
      new THREE.Vector3(maxX, gridY, minZ),
      new THREE.Vector3(maxX, gridY, maxZ),
      new THREE.Vector3(minX, gridY, maxZ),
      new THREE.Vector3(minX, gridY, minZ)
    ]);
    const borderLine = new THREE.Line(borderGeometry, borderMaterial);
    group.add(borderLine);

    // Configurar renderOrder para que la cuadrícula se renderice por encima
    group.renderOrder = 1000;
    
    return group;
  }, [editMode]);

  if (!gridGroup) return null;

  return <primitive object={gridGroup} renderOrder={1000} />;
};
