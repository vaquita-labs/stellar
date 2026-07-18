import { MapObject, MapObjectType } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../../constants';
import { getY_0 } from '../../helpers';
import { BuildContext } from '../../types';
import { getPalette } from '../palette';
import { addBoxes, BoxSpec, getSharedRoundedTileGeometry, TILE_CORNER_RADIUS } from '../recipe';

// El agua queda 0.2 por debajo del pasto: se ve la orilla (pasto + tierra).
const WATER_HEIGHT = TILE_HEIGHT * 0.8;

export const getWaterGroup = ({ position: [x, , z] }: MapObject, ctx: BuildContext) => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();
  const originY = getY_0(WATER_HEIGHT);
  const surfaceY = originY + WATER_HEIGHT / 2;

  // Lados y esquinas del tile que dan al vacío (borde del mapa o hueco).
  const voidSides: Array<[number, number]> = [];
  let cornerMask = 0;
  if (ctx.tileXZ && ctx.neighborTypeAt) {
    const [tx, tz] = ctx.tileXZ;
    const isVoid = (neighbor?: MapObjectType) => neighbor === undefined || neighbor === MapObjectType.EMPTY;
    const voidPX = isVoid(ctx.neighborTypeAt(tx + 1, tz));
    const voidNX = isVoid(ctx.neighborTypeAt(tx - 1, tz));
    const voidPZ = isVoid(ctx.neighborTypeAt(tx, tz + 1));
    const voidNZ = isVoid(ctx.neighborTypeAt(tx, tz - 1));
    if (voidPX) voidSides.push([1, 0]);
    if (voidNX) voidSides.push([-1, 0]);
    if (voidPZ) voidSides.push([0, 1]);
    if (voidNZ) voidSides.push([0, -1]);
    // Misma regla de costa que el terreno: donde el agua misma dobla en el
    // borde del mapa, la esquina se redondea en planta.
    if (voidPX && voidPZ) cornerMask |= 1;
    if (voidPX && voidNZ) cornerMask |= 2;
    if (voidNX && voidNZ) cornerMask |= 4;
    if (voidNX && voidPZ) cornerMask |= 8;
  }

  // Bloque de agua. faceShade: superficie clara y paredes sombreadas en el
  // borde de la isla. Sin contorno propio en las orillas contra tierra.
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

  // Cascada: donde el agua termina en el borde del mapa (o un hueco), la cara
  // expuesta lleva una cortina más clara (agua cayendo) y espuma al pie, al
  // nivel del océano.
  const foam = { color: palette.foam, material: 'lambert', castShadow: false, receiveShadow: false } as const;
  // El origen del grupo queda a y=-0.6 en mundo; el océano está en y=-0.85.
  const foamY = -0.23;
  const foamOut = TILE_SIZE / 2 + 0.06;
  for (const [dx, dz] of voidSides) {
    const alongX = dz !== 0; // el borde expuesto corre a lo largo de x
    // La cortina se recorta donde la esquina está redondeada, para que su
    // extremo recto no sobresalga de la curva del bloque.
    let start = -TILE_SIZE / 2;
    let end = TILE_SIZE / 2;
    const bitPos = alongX ? (dz === 1 ? 1 : 2) : dx === 1 ? 1 : 8;
    const bitNeg = alongX ? (dz === 1 ? 8 : 4) : dx === 1 ? 2 : 4;
    if (cornerMask & bitPos) end -= TILE_CORNER_RADIUS;
    if (cornerMask & bitNeg) start += TILE_CORNER_RADIUS;
    const length = end - start;
    const mid = (start + end) / 2;
    // Cortina del color EXACTO del agua (sin faceShade, para que la cara
    // que cae no se vea de otro tono); la cascada se lee por la espuma.
    specs.push({
      size: alongX ? [length, WATER_HEIGHT, 0.06] : [0.06, WATER_HEIGHT, length],
      at: [alongX ? mid : dx * (TILE_SIZE / 2 - 0.03), 0, alongX ? dz * (TILE_SIZE / 2 - 0.03) : mid],
      color: palette.water,
      material: 'lambert',
      castShadow: false,
      receiveShadow: false,
    });
    // Nube de espuma a lo largo de toda la base de la caída: motas
    // redondeadas de tamaños variados, medio hundidas en el océano.
    const blobs: Array<[number, [number, number, number]]> = [
      [-0.34, [0.26, 0.15, 0.2]],
      [-0.09, [0.34, 0.19, 0.24]],
      [0.15, [0.28, 0.14, 0.2]],
      [0.37, [0.22, 0.17, 0.18]],
    ];
    for (const [offset, [w, h, d]] of blobs) {
      specs.push({
        ...foam,
        size: alongX ? [w, h, d] : [d, h, w],
        at: [alongX ? offset : dx * foamOut, foamY, alongX ? dz * foamOut : offset],
        bevel: Math.min(w, h, d) / 2 - 0.015,
      });
    }
  }

  addBoxes(group, [x, originY, z], specs);

  return group;
};
