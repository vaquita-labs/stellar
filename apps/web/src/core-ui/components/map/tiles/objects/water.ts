import { MapObject, MapObjectType } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../../constants';
import { getY_0 } from '../../helpers';
import { BuildContext } from '../../types';
import { getPalette } from '../palette';
import { addBoxes, BoxSpec } from '../recipe';

// El agua queda 0.2 por debajo del pasto: se ve la orilla (pasto + tierra).
const WATER_HEIGHT = TILE_HEIGHT * 0.8;

export const getWaterGroup = ({ position: [x, , z] }: MapObject, ctx: BuildContext) => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();

  // faceShade: superficie clara y paredes sombreadas en el borde de la isla.
  // Sin contorno propio: las orillas contra tierra quedan limpias.
  const specs: BoxSpec[] = [
    { size: [TILE_SIZE, WATER_HEIGHT, TILE_SIZE], at: [0, 0, 0], color: palette.water, material: 'lambert', faceShade: true },
  ];

  // Cascada: donde el agua termina en el borde del mapa (o un hueco), la cara
  // expuesta lleva una cortina más clara (agua cayendo) y espuma al pie, al
  // nivel del océano.
  if (ctx.tileXZ && ctx.neighborTypeAt) {
    const [tx, tz] = ctx.tileXZ;
    const isVoid = (neighbor?: MapObjectType) => neighbor === undefined || neighbor === MapObjectType.EMPTY;
    const foam = { color: palette.foam, material: 'lambert', castShadow: false, receiveShadow: false } as const;
    // El origen del grupo queda a y=-0.6 en mundo; el océano está en y=-0.85.
    const foamY = -0.23;
    const foamOut = TILE_SIZE / 2 + 0.06;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!isVoid(ctx.neighborTypeAt(tx + dx, tz + dz))) continue;
      const alongX = dz !== 0; // el borde expuesto corre a lo largo de x
      // Cortina del color EXACTO del agua (sin faceShade, para que la cara
      // que cae no se vea de otro tono); la cascada se lee por la espuma.
      specs.push({
        size: alongX ? [TILE_SIZE, WATER_HEIGHT, 0.06] : [0.06, WATER_HEIGHT, TILE_SIZE],
        at: [dx * (TILE_SIZE / 2 - 0.03), 0, dz * (TILE_SIZE / 2 - 0.03)],
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
  }

  addBoxes(group, [x, getY_0(WATER_HEIGHT), z], specs);

  return group;
};
