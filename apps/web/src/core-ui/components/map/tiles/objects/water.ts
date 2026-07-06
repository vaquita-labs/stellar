import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../../constants';
import { getY_0 } from '../../helpers';
import { getPalette } from '../palette';
import { getSharedBoxGeometry } from '../recipe';

export const getWaterGroup = ({ position: [x, , z] }: MapObject, worldType: WorldType) => {
  const palette = getPalette(worldType);

  const height = TILE_HEIGHT * 0.8;
  const mesh = new THREE.Mesh(
    getSharedBoxGeometry(TILE_SIZE, height, TILE_SIZE),
    new THREE.MeshLambertMaterial({ color: palette.water })
  );

  mesh.castShadow = true; // el bloque de agua proyecta sombra sobre el océano de abajo
  mesh.receiveShadow = true; // y recibe la sombra del pasto/árboles que la rodean
  mesh.position.set(x, getY_0(height), z);

  return mesh;
};
