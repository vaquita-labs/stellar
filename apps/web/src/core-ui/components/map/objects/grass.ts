import { getY_0 } from '@/core-ui/components/map/helpers';
import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';

const colorPalettes = {
  [WorldType.FOREST]: {
    grass: '#A1CD5A',
  },
  [WorldType.DESERT]: {
    grass: '#FFE49A',
  },
  [WorldType.VOLCANO]: {
    grass: '#624D4A',
  },
};

export const getGrassGroup = ({ position: [x, , z] }: MapObject, worldType: WorldType) => {
  const palette = colorPalettes[worldType] || colorPalettes[WorldType.FOREST];

  const height = TILE_HEIGHT;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE),
    new THREE.MeshLambertMaterial({ color: palette.grass })
  );

  mesh.castShadow = false; // Los bloques planos de grass no deben proyectar sombras entre sí
  mesh.receiveShadow = true; // Pero sí deben recibir sombras de elementos por encima (árboles, edificios, etc.)
  mesh.position.set(x, getY_0(height), z);

  return mesh;
};
