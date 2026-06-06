import { getY_0 } from '@/core-ui/components/map/helpers';
import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';

const colorPalettes = {
  [WorldType.FOREST]: {
    grass: '#A1CD5A',
    // Tierra visible en los lados y la base del bloque (efecto pasto arriba, tierra abajo)
    dirt: '#9B7653',
    dirtDark: '#7E5F42',
  },
  [WorldType.DESERT]: {
    grass: '#FFE49A',
    dirt: '#D9B36A',
    dirtDark: '#B8924F',
  },
  [WorldType.VOLCANO]: {
    grass: '#624D4A',
    dirt: '#3E2F2D',
    dirtDark: '#2C2120',
  },
};

// Grosor de la franja de pasto en la parte superior del bloque; el resto es tierra.
const GRASS_LAYER_HEIGHT = TILE_HEIGHT * 0.2;

export const getGrassGroup = ({ position: [x, , z] }: MapObject, worldType: WorldType) => {
  const palette = colorPalettes[worldType] || colorPalettes[WorldType.FOREST];

  const group = new THREE.Group();

  // El bloque completo ocupa de y=-TILE_HEIGHT a y=0 (mismo rango que antes).
  const fullTop = getY_0(TILE_HEIGHT) + TILE_HEIGHT / 2; // = 0
  const fullBottom = getY_0(TILE_HEIGHT) - TILE_HEIGHT / 2; // = -TILE_HEIGHT

  // Capa de pasto (franja superior): cara de arriba pasto, costados pasto también.
  const grassHeight = GRASS_LAYER_HEIGHT;
  const grassMat = new THREE.MeshLambertMaterial({ color: palette.grass });
  const grassMesh = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE, grassHeight, TILE_SIZE), grassMat);
  grassMesh.position.set(x, fullTop - grassHeight / 2, z);
  grassMesh.castShadow = true;
  grassMesh.receiveShadow = true;
  group.add(grassMesh);

  // Capa de tierra (debajo del pasto): costados y base de tierra.
  const dirtHeight = TILE_HEIGHT - grassHeight;
  const dirtMat = new THREE.MeshLambertMaterial({ color: palette.dirt });
  const dirtBottomMat = new THREE.MeshLambertMaterial({ color: palette.dirtDark });
  const dirtMaterials = [
    dirtMat, // +x lado
    dirtMat, // -x lado
    dirtMat, // +y (queda oculto bajo el pasto)
    dirtBottomMat, // -y base
    dirtMat, // +z lado
    dirtMat, // -z lado
  ];
  const dirtMesh = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE, dirtHeight, TILE_SIZE), dirtMaterials);
  dirtMesh.position.set(x, fullBottom + dirtHeight / 2, z);
  dirtMesh.castShadow = true;
  dirtMesh.receiveShadow = true;
  group.add(dirtMesh);

  return group;
};
