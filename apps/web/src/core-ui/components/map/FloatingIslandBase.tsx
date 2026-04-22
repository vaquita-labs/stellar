'use client';

import { MAP_SIZE, TILE_SIZE } from '../templates/WorldMap/vaquita/constants';
import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Componente que crea una base cónica de tierra estilo boxel art debajo de la isla flotante
 * Usa bloques individuales para crear un efecto voxel/boxel art
 */
export const FloatingIslandBase = () => {
  const baseGroup = useMemo(() => {
    const group = new THREE.Group();
    
    // Materiales de tierra (variaciones de marrón)
    const earthMaterial = new THREE.MeshLambertMaterial({ 
      color: '#8B7355',
      flatShading: true
    });
    
    const earthMaterialDark = new THREE.MeshLambertMaterial({ 
      color: '#6B5B47',
      flatShading: true
    });

    const centerX = (MAP_SIZE - 1) / 2;
    const centerZ = (MAP_SIZE - 1) / 2;
    const baseY = -TILE_SIZE; // Nivel del suelo
    const voxelSize = TILE_SIZE; // Tamaño de cada bloque voxel
    
    // Radio máximo de la base (un poco más grande que la isla)
    const maxRadius = (MAP_SIZE * TILE_SIZE) / 2 + TILE_SIZE * 0.5;
    const coneHeight = 12; // Altura del cono en bloques
    
    // Mover el cono ligeramente hacia abajo para evitar z-fighting con el terreno
    // Empezar desde un nivel más bajo para que no se superponga
    const coneStartOffset = TILE_SIZE * 0.2; // Offset más grande para evitar colisión
    
    // Crear cono usando bloques individuales estilo boxel art
    // Cada nivel del cono tiene un radio menor
    for (let level = 0; level < coneHeight; level++) {
      const levelY = baseY - level * voxelSize - voxelSize / 2 - coneStartOffset;
      const radius = maxRadius * (1 - (level / coneHeight));
      
      // Calcular cuántos bloques caben en este nivel
      const blocksPerSide = Math.max(1, Math.floor(radius * 2 / voxelSize));
      const step = (radius * 2) / blocksPerSide;
      
      // Crear bloques en una cuadrícula para este nivel
      for (let i = 0; i <= blocksPerSide; i++) {
        for (let j = 0; j <= blocksPerSide; j++) {
          const x = centerX - radius + i * step;
          const z = centerZ - radius + j * step;
          
          // Calcular distancia desde el centro
          const distX = x - centerX;
          const distZ = z - centerZ;
          const distance = Math.sqrt(distX * distX + distZ * distZ);
          
          // Solo crear bloques dentro del radio del nivel
          if (distance <= radius + voxelSize * 0.1) {
            // Usar material alternado para variación visual
            const material = (i + j + level) % 2 === 0 ? earthMaterial : earthMaterialDark;
            
            const voxelGeometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
            const voxelMesh = new THREE.Mesh(voxelGeometry, material);
            voxelMesh.position.set(x, levelY, z);
            voxelMesh.castShadow = true; // Proyectar sombras para mayor realismo
            voxelMesh.receiveShadow = true; // Recibir sombras de la luz direccional para que las partes sin sol se vean oscuras
            // Renderizar después del terreno para evitar z-fighting
            voxelMesh.renderOrder = -1;
            group.add(voxelMesh);
          }
        }
      }
    }
    
    // Configurar renderOrder para evitar z-fighting con el terreno
    group.renderOrder = -1;
    
    return group;
  }, []);

  return <primitive object={baseGroup} renderOrder={-1} />;
};
