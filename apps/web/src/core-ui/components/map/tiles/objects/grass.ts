import { MapObject } from '@/core-ui/types';
import * as THREE from 'three';
import { BuildContext } from '../../types';
import { getPalette } from '../palette';
import { addTerrainTile } from '../recipe';

// Tile de pasto: capa de pasto + tierra + contorno del mapa en lados
// expuestos (todo lo arma addTerrainTile). El damero sutil de dos tonos
// sigue el diseño de la app.
export const getGrassGroup = ({ position: [x, , z] }: MapObject, ctx: BuildContext) => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();

  const checker = ctx.tileXZ ? (ctx.tileXZ[0] + ctx.tileXZ[1]) % 2 !== 0 : false;
  addTerrainTile(group, x, z, checker ? palette.grassTopAlt : palette.grassTop, ctx);

  return group;
};
