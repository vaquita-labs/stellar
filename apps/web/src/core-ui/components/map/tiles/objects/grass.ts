import { MapObject } from '@/core-ui/types';
import * as THREE from 'three';
import { BuildContext } from '../../types';
import { getPalette } from '../palette';
import { addFixedTerrainTile } from '../recipe';

// Tile de pasto: capa de pasto + tierra + contorno del mapa en lados
// expuestos (todo lo arma addTerrainTile). El damero sutil de dos tonos
// sigue el diseño de la app. El terreno va contra-rotado (addFixedTerrainTile):
// su contorno de costa es direccional y debe quedar fijo a la grilla aunque el
// tile se rote en edición.
export const getGrassGroup = ({ position: [x, , z], rotation }: MapObject, ctx: BuildContext) => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();

  const checker = ctx.tileXZ ? (ctx.tileXZ[0] + ctx.tileXZ[1]) % 2 !== 0 : false;
  addFixedTerrainTile(group, x, z, checker ? palette.grassTopAlt : palette.grassTop, ctx, rotation?.[1] ?? 0);

  return group;
};
