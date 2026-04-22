import { getY_0 } from '@/core-ui/components/map/helpers';
import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';

const colorPalettes = {
  [WorldType.FOREST]: {
    road: '#000000',
  },
  [WorldType.DESERT]: {
    road: '#000000',
  },
  [WorldType.VOLCANO]: {
    road: '#000000',
  },
};

export const getRoadGroup = ({ position: [x, , z] }: MapObject, worldType: WorldType) => {
  const palette = colorPalettes[worldType] || colorPalettes[WorldType.FOREST];

  const height = TILE_HEIGHT;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE),
    new THREE.MeshLambertMaterial({ color: palette.road })
  );

  mesh.castShadow = false; // Los bloques planos de road no deben proyectar sombras entre sí
  mesh.receiveShadow = true; // Pero sí deben recibir sombras de elementos por encima
  mesh.position.set(x, getY_0(height), z);

  return mesh;
};
