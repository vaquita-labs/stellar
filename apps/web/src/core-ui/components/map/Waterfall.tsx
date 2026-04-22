'use client';

import { MapObject, MapObjectType, WorldType } from '@/core-ui/types';
import { useMemo } from 'react';
import * as THREE from 'three';
import { MAP_SIZE, TILE_HEIGHT, TILE_SIZE } from '../templates/WorldMap/vaquita/constants';
import { getY_0 } from './helpers';

interface WaterfallProps {
  mapObjects: MapObject[];
  worldType: WorldType;
}

const colorPalettes = {
  [WorldType.FOREST]: {
    water: '#6FF2F1',
  },
  [WorldType.DESERT]: {
    water: '#4DB8E8',
  },
  [WorldType.VOLCANO]: {
    water: '#FF9C1C',
  },
};

/**
 * Componente que crea cascadas de agua estáticas estilo voxel solo en las esquinas del mapa.
 * Si hay agua en el bloque de la esquina, se generan cascadas. Si los bloques adyacentes también
 * tienen agua, se generan cascadas adicionales en esos bloques. Crea una columna continua de
 * bloques de agua desde el nivel del agua hasta abajo.
 */
export const Waterfall = ({ mapObjects, worldType }: WaterfallProps) => {
  const palette = colorPalettes[worldType] || colorPalettes[WorldType.FOREST];

  // Crear un mapa de posiciones de agua para verificación rápida
  const waterPositionsSet = useMemo(() => {
    const positions = new Set<string>();
    mapObjects
      .filter((obj) => obj.type === MapObjectType.WATER)
      .forEach((obj) => {
        const [x, , z] = obj.position;
        positions.add(`${x},${z}`);
      });
    return positions;
  }, [mapObjects]);

  // Detectar solo las esquinas del mapa y crear cascadas en los bloques de cada esquina que tengan agua
  const waterfallPositions = useMemo(() => {
    const positions: Array<{ x: number; z: number; edge: 'north' | 'south' | 'east' | 'west' }> = [];

    // Función auxiliar para verificar si hay agua en una posición
    const hasWater = (x: number, z: number) => waterPositionsSet.has(`${x},${z}`);

    // Esquina superior izquierda (noroeste): x=0, z=MAP_SIZE-1
    // Los 3 bloques son: (0, MAP_SIZE-1), (0, MAP_SIZE-2), (1, MAP_SIZE-1)
    if (hasWater(0, MAP_SIZE - 1)) {
      // Bloque de la esquina - cascadas en norte y oeste
      positions.push({ x: 0, z: MAP_SIZE - 1, edge: 'north' });
      positions.push({ x: 0, z: MAP_SIZE - 1, edge: 'west' });
      // Bloque adyacente sur - cascada en norte (si tiene agua)
      if (hasWater(0, MAP_SIZE - 2)) {
        positions.push({ x: 0, z: MAP_SIZE - 2, edge: 'north' });
      }
      // Bloque adyacente este - cascada en oeste (si tiene agua)
      if (hasWater(1, MAP_SIZE - 1)) {
        positions.push({ x: 1, z: MAP_SIZE - 1, edge: 'west' });
      }
    }

    // Esquina superior derecha (noreste): x=MAP_SIZE-1, z=MAP_SIZE-1
    // Los 3 bloques son: (MAP_SIZE-1, MAP_SIZE-1), (MAP_SIZE-1, MAP_SIZE-2), (MAP_SIZE-2, MAP_SIZE-1)
    if (hasWater(MAP_SIZE - 1, MAP_SIZE - 1)) {
      // Bloque de la esquina - cascadas en norte y este
      positions.push({ x: MAP_SIZE - 1, z: MAP_SIZE - 1, edge: 'north' });
      positions.push({ x: MAP_SIZE - 1, z: MAP_SIZE - 1, edge: 'east' });
      // Bloque adyacente sur - cascada en norte (si tiene agua)
      if (hasWater(MAP_SIZE - 1, MAP_SIZE - 2)) {
        positions.push({ x: MAP_SIZE - 1, z: MAP_SIZE - 2, edge: 'north' });
      }
      // Bloque adyacente oeste - cascada en este (si tiene agua)
      if (hasWater(MAP_SIZE - 2, MAP_SIZE - 1)) {
        positions.push({ x: MAP_SIZE - 2, z: MAP_SIZE - 1, edge: 'east' });
      }
    }

    // Esquina inferior izquierda (suroeste): x=0, z=0
    // Los 3 bloques son: (0, 0), (0, 1), (1, 0)
    if (hasWater(0, 0)) {
      // Bloque de la esquina - cascadas en sur y oeste
      positions.push({ x: 0, z: 0, edge: 'south' });
      positions.push({ x: 0, z: 0, edge: 'west' });
      // Bloque adyacente norte - cascada en sur (si tiene agua)
      if (hasWater(0, 1)) {
        positions.push({ x: 0, z: 1, edge: 'south' });
      }
      // Bloque adyacente este - cascada en oeste (si tiene agua)
      if (hasWater(1, 0)) {
        positions.push({ x: 1, z: 0, edge: 'west' });
      }
    }

    // Esquina inferior derecha (sureste): x=MAP_SIZE-1, z=0
    // Los 3 bloques son: (MAP_SIZE-1, 0), (MAP_SIZE-1, 1), (MAP_SIZE-2, 0)
    if (hasWater(MAP_SIZE - 1, 0)) {
      // Bloque de la esquina - cascadas en sur y este
      positions.push({ x: MAP_SIZE - 1, z: 0, edge: 'south' });
      positions.push({ x: MAP_SIZE - 1, z: 0, edge: 'east' });
      // Bloque adyacente norte - cascada en sur (si tiene agua)
      if (hasWater(MAP_SIZE - 1, 1)) {
        positions.push({ x: MAP_SIZE - 1, z: 1, edge: 'south' });
      }
      // Bloque adyacente oeste - cascada en este (si tiene agua)
      if (hasWater(MAP_SIZE - 2, 0)) {
        positions.push({ x: MAP_SIZE - 2, z: 0, edge: 'east' });
      }
    }

    return positions;
  }, [waterPositionsSet]);

  // Crear las cascadas estáticas (columna continua de agua)
  const waterfallGroup = useMemo(() => {
    const group = new THREE.Group();
    const waterHeight = TILE_HEIGHT * 1;
    const waterTileY = getY_0(waterHeight); // Centro del agua del tile
    const waterTileBottomY = waterTileY - waterHeight / 2; // Borde inferior del agua
    const waterfallWidth = TILE_SIZE * 1; // Ancho de la cascada (casi del tamaño del tile)
    const cascadeLength = 20; // Longitud de la cascada hacia abajo

    waterfallPositions.forEach(({ x, z, edge }) => {
      // Calcular posición inicial según el borde
      const startX = x;
      const startZ = z;
      let offsetX = 0;
      let offsetZ = 0;
      let widthX = waterfallWidth;
      let widthZ = TILE_SIZE * 0.1; // Grosor de la cascada (delgado)

      // Ajustar posición según el borde para que esté exactamente en el borde sin sobresalir
      if (edge === 'north') {
        // Borde norte: la cascada debe estar en z + 0.5 (borde del tile)
        // El centro debe estar en: borde - mitad del grosor
        offsetZ = TILE_SIZE * 0.5 - widthZ / 2;
        widthX = waterfallWidth;
      } else if (edge === 'south') {
        // Borde sur: la cascada debe estar en z - 0.5 (borde del tile)
        offsetZ = -TILE_SIZE * 0.5 + widthZ / 2;
        widthX = waterfallWidth;
      } else if (edge === 'east') {
        // Borde este: la cascada debe estar en x + 0.5 (borde del tile)
        widthX = TILE_SIZE * 0.1; // Grosor delgado en dirección X
        widthZ = waterfallWidth; // Ancho en dirección Z
        offsetX = TILE_SIZE * 0.5 - widthX / 2;
      } else if (edge === 'west') {
        // Borde oeste: la cascada debe estar en x - 0.5 (borde del tile)
        widthX = TILE_SIZE * 0.1; // Grosor delgado en dirección X
        widthZ = waterfallWidth; // Ancho en dirección Z
        offsetX = -TILE_SIZE * 0.5 + widthX / 2;
      }

      // Crear una columna continua de agua (una sola geometría alargada)
      // Agregar un pequeño overlap para asegurar que no haya espacios
      const overlap = 0.1; // Pequeña superposición para eliminar espacios
      const extendedCascadeLength = cascadeLength + overlap;
      const waterfallGeometry = new THREE.BoxGeometry(widthX, extendedCascadeLength, widthZ);
      const waterfallMaterial = new THREE.MeshLambertMaterial({
        color: palette.water,
        transparent: true,
        opacity: 0.9,
        flatShading: true,
      });

      const waterfall = new THREE.Mesh(waterfallGeometry, waterfallMaterial);

      // Posición Y: empezar ligeramente por encima del borde inferior del agua
      // para que se superponga y elimine cualquier espacio visible
      // El borde superior de la cascada debe estar en: waterTileBottomY + overlap
      // El centro de la geometría está en: (waterTileBottomY + overlap) - extendedCascadeLength/2
      const waterfallY = waterTileBottomY + overlap - extendedCascadeLength / 2;

      waterfall.position.set(startX + offsetX, waterfallY, startZ + offsetZ);
      waterfall.castShadow = true;
      waterfall.receiveShadow = false;
      group.add(waterfall);
    });

    return group;
  }, [waterfallPositions, palette.water]);

  return <primitive object={waterfallGroup} />;
};
