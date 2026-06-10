import { getY_0 } from '@/core-ui/components/map/helpers';
import { TILE_HEIGHT, TILE_SIZE } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';

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

export const getWaterGroup = ({ position: [x, , z] }: MapObject, worldType: WorldType) => {
  const palette = colorPalettes[worldType] || colorPalettes[WorldType.FOREST];
  const height = TILE_HEIGHT * 0.8;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE),
    new THREE.MeshLambertMaterial({ color: palette.water })
  );

  mesh.castShadow = true; // el bloque de agua proyecta sombra sobre el océano de abajo
  mesh.receiveShadow = true; // y recibe la sombra del pasto/árboles que la rodean
  mesh.position.set(x, getY_0(height), z);

  return mesh;
};
