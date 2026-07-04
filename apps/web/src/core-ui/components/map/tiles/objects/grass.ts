import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../../constants';
import { getY_0 } from '../../helpers';
import { getPalette } from '../palette';
import { getSharedBoxGeometry } from '../recipe';

// Grosor de la franja de pasto en la parte superior del bloque; el resto es tierra.
const GRASS_LAYER_HEIGHT = TILE_HEIGHT * 0.2;

// El tile de pasto es el único con materiales por cara (tierra a los lados,
// tierra oscura en la base), por eso no usa el formato de receta.
export const getGrassGroup = ({ position: [x, , z] }: MapObject, worldType: WorldType) => {
  const palette = getPalette(worldType);

  const group = new THREE.Group();

  // El bloque completo ocupa de y=-TILE_HEIGHT a y=0 (mismo rango que antes).
  const fullTop = getY_0(TILE_HEIGHT) + TILE_HEIGHT / 2; // = 0
  const fullBottom = getY_0(TILE_HEIGHT) - TILE_HEIGHT / 2; // = -TILE_HEIGHT

  // Capa de pasto (franja superior): cara de arriba pasto, costados pasto también.
  const grassHeight = GRASS_LAYER_HEIGHT;
  const grassMat = new THREE.MeshLambertMaterial({ color: palette.grassTop });
  const grassMesh = new THREE.Mesh(getSharedBoxGeometry(TILE_SIZE, grassHeight, TILE_SIZE), grassMat);
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
  const dirtMesh = new THREE.Mesh(getSharedBoxGeometry(TILE_SIZE, dirtHeight, TILE_SIZE), dirtMaterials);
  dirtMesh.position.set(x, fullBottom + dirtHeight / 2, z);
  dirtMesh.castShadow = true;
  dirtMesh.receiveShadow = true;
  group.add(dirtMesh);

  return group;
};
