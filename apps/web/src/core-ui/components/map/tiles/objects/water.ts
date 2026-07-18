import { MapObject, MapObjectType } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../../constants';
import { getY_0 } from '../../helpers';
import { BuildContext } from '../../types';
import { getPalette } from '../palette';
import { addBoxes, BoxSpec, getSharedRoundedTileGeometry } from '../recipe';

// El agua queda 0.2 por debajo del pasto: se ve la orilla (pasto + tierra).
const WATER_HEIGHT = TILE_HEIGHT * 0.8;

export const getWaterGroup = ({ position: [x, , z] }: MapObject, ctx: BuildContext) => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();
  const originY = getY_0(WATER_HEIGHT);
  const surfaceY = originY + WATER_HEIGHT / 2;

  // Esquinas redondeadas del bloque de agua.
  let cornerMask = 0;
  if (ctx.tileXZ && ctx.neighborTypeAt) {
    const [tx, tz] = ctx.tileXZ;
    const isVoid = (neighbor?: MapObjectType) => neighbor === undefined || neighbor === MapObjectType.EMPTY;
    const isWater = (neighbor?: MapObjectType) => neighbor === MapObjectType.WATER;
    const nPX = ctx.neighborTypeAt(tx + 1, tz);
    const nNX = ctx.neighborTypeAt(tx - 1, tz);
    const nPZ = ctx.neighborTypeAt(tx, tz + 1);
    const nNZ = ctx.neighborTypeAt(tx, tz - 1);
    // Misma regla de costa que el terreno donde el agua dobla en el borde del
    // mapa, y ADEMÁS en las bocas de cascada: si el borde de caída se
    // encuentra con un tile de tierra, el agua se retira con la curva antes
    // de caer (la junta plana tierra/agua se veía mal). Contra otra agua
    // nunca se redondea (la superficie continúa).
    const rounds = (a?: MapObjectType, b?: MapObjectType) => (isVoid(a) || isVoid(b)) && !isWater(a) && !isWater(b);
    if (rounds(nPX, nPZ)) cornerMask |= 1;
    if (rounds(nPX, nNZ)) cornerMask |= 2;
    if (rounds(nNX, nNZ)) cornerMask |= 4;
    if (rounds(nNX, nPZ)) cornerMask |= 8;
  }

  // Bloque de agua ÚNICO — la cara del propio bloque dibuja la caída de la
  // cascada. (Hubo una "cortina" extra pegada al borde: coplanar con la cara
  // del bloque, z-fighteaba en parches al mover la cámara.) faceShade:
  // superficie clara y paredes sombreadas; sin contorno propio en orillas.
  const specs: BoxSpec[] = [];
  if (cornerMask) {
    const waterMesh = new THREE.Mesh(
      getSharedRoundedTileGeometry(WATER_HEIGHT, cornerMask, true),
      new THREE.MeshLambertMaterial({ color: palette.water, vertexColors: true })
    );
    waterMesh.castShadow = true;
    waterMesh.receiveShadow = true;
    waterMesh.position.set(x, surfaceY, z);
    group.add(waterMesh);
  } else {
    specs.push({ size: [TILE_SIZE, WATER_HEIGHT, TILE_SIZE], at: [0, 0, 0], color: palette.water, material: 'lambert', faceShade: true });
  }

  addBoxes(group, [x, originY, z], specs);

  return group;
};
