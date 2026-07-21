import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../../constants';
import { getY_0 } from '../../helpers';
import { getPalette } from '../palette';
import { getSharedBoxGeometry } from '../recipe';

export const getRoadGroup = ({ position: [x, , z] }: MapObject, worldType: WorldType) => {
  const palette = getPalette(worldType);

  const height = TILE_HEIGHT;
  const mesh = new THREE.Mesh(
    getSharedBoxGeometry(TILE_SIZE, height, TILE_SIZE),
    new THREE.MeshLambertMaterial({ color: palette.road })
  );

  mesh.castShadow = false; // Los bloques planos de road no deben proyectar sombras entre sí
  mesh.receiveShadow = true; // Pero sí deben recibir sombras de elementos por encima
  mesh.position.set(x, getY_0(height), z);

  return mesh;
};
