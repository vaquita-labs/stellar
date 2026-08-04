import { MapObject, MapObjectType } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../../constants';
import { BuildContext } from '../../types';
import { getPalette } from '../palette';
import { addBoxes, BoxSpec, getSharedRoundedTileGeometry, TILE_CORNER_RADIUS } from '../recipe';

// El agua queda 0.2 por debajo del pasto (se ve la orilla) y TERMINA apenas
// bajo la superficie del mar (WaterBackground en y=-0.85): el bloque no debe
// seguir bajo el agua — "el agua se acaba donde acaba".
const WATER_HEIGHT = TILE_HEIGHT * 0.68;
const WATER_ORIGIN_Y = -TILE_HEIGHT * 0.2 - WATER_HEIGHT / 2;

// ---------------------------------------------------------------------------
// Vetas de la cascada: textura compartida con trazos verticales blancos que
// baja MUY lento (offset.y animado por WaterBackground). El patrón cubre
// varios tiles de ancho y cada tile muestrea con una fase propia: con un
// patrón de un tile repetido se veía ordenado, como barrotes.
// ---------------------------------------------------------------------------

// Cuántos tiles de mundo cubre la textura antes de repetirse, y cuántas
// alturas de cara abarca verticalmente: con el patrón de UNA cara de alto,
// cada trazo envolvía en su misma columna y "su sucesor" aparecía siempre en
// el mismo lugar; con 3 caras de ciclo, mientras un trazo sale entran otros
// en columnas distintas — la sucesión se ve aleatoria.
const FALL_PATTERN_SPAN = 4;
const FALL_PATTERN_VSPAN = 3;

// [posición u (0..1), ancho, arranque v (0..1 del ciclo alto), largo en
// unidades del ciclo]: valores irregulares a mano (pseudo-aleatorio
// determinista) repartidos por todo el patrón.
const FALL_STREAKS: Array<[number, number, number, number]> = [
  [0.03, 0.005, 0.05, 0.14],
  [0.09, 0.007, 0.51, 0.11],
  [0.16, 0.004, 0.83, 0.16],
  [0.23, 0.006, 0.27, 0.1],
  [0.31, 0.005, 0.66, 0.09],
  [0.36, 0.004, 0.12, 0.15],
  [0.44, 0.007, 0.92, 0.12],
  [0.52, 0.005, 0.38, 0.16],
  [0.58, 0.004, 0.73, 0.08],
  [0.66, 0.006, 0.19, 0.15],
  [0.72, 0.005, 0.58, 0.1],
  [0.79, 0.004, 0.02, 0.13],
  [0.87, 0.006, 0.45, 0.09],
  [0.94, 0.005, 0.78, 0.15],
  [0.06, 0.004, 0.34, 0.1],
  [0.28, 0.005, 0.88, 0.13],
  [0.49, 0.004, 0.08, 0.11],
  [0.62, 0.005, 0.41, 0.13],
  [0.76, 0.004, 0.25, 0.09],
  [0.91, 0.005, 0.6, 0.12],
  [0.01, 0.005, 0.7, 0.12],
  [0.13, 0.004, 0.48, 0.1],
  [0.19, 0.006, 0.95, 0.14],
  [0.26, 0.004, 0.57, 0.09],
  [0.34, 0.006, 0.3, 0.13],
  [0.4, 0.005, 0.76, 0.1],
  [0.47, 0.004, 0.52, 0.14],
  [0.55, 0.006, 0.15, 0.1],
  [0.6, 0.005, 0.86, 0.12],
  [0.69, 0.004, 0.62, 0.14],
  [0.74, 0.006, 0.04, 0.09],
  [0.82, 0.005, 0.36, 0.12],
  [0.85, 0.004, 0.9, 0.1],
  [0.89, 0.006, 0.14, 0.11],
  [0.97, 0.004, 0.42, 0.13],
  [0.51, 0.005, 0.98, 0.1],
];

let fallTexture: THREE.DataTexture | null = null;
export const getFallStreaksTexture = (): THREE.DataTexture => {
  if (!fallTexture) {
    // DataTexture a mano (no canvas): TODO el lienzo lleva RGB blanco y solo
    // el alfa dibuja los trazos. Con canvas, los texels transparentes quedan
    // negro-transparente y el filtrado pinta un halo oscuro en los bordes.
    const W = 512;
    const H = 256 * FALL_PATTERN_VSPAN;
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
    const paint = (x: number, y: number, w: number, h: number) => {
      for (let px = x; px < x + w; px++) {
        for (let py = y; py < y + h; py++) {
          data[(((py % H) + H) % H * W + ((px % W) + W) % W) * 4 + 3] = 255;
        }
      }
    };
    for (const [u, width, v, length] of FALL_STREAKS) {
      // los trazos envuelven verticalmente (el scroll repite)
      const w = Math.max(2, Math.round(width * W));
      paint(Math.round(u * W - w / 2), Math.round(v * H), w, Math.round(length * H));
    }
    fallTexture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    fallTexture.wrapS = THREE.RepeatWrapping;
    fallTexture.wrapT = THREE.RepeatWrapping;
    fallTexture.magFilter = THREE.LinearFilter;
    fallTexture.minFilter = THREE.LinearMipmapLinearFilter;
    fallTexture.generateMipmaps = true;
    fallTexture.needsUpdate = true;
  }
  return fallTexture;
};

// Fase cuantizada a octavos: mantiene chico el cache de geometrías.
const fallQuadCache = new Map<string, THREE.PlaneGeometry>();
const getSharedFallQuadGeometry = (length: number, phase: number): THREE.PlaneGeometry => {
  const key = `${length}|${phase}`;
  let geometry = fallQuadCache.get(key);
  if (!geometry) {
    geometry = new THREE.PlaneGeometry(length, WATER_HEIGHT);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setX(i, (uv.getX(i) * length) / FALL_PATTERN_SPAN + phase);
      // la cara muestra 1/VSPAN del ciclo vertical
      uv.setY(i, uv.getY(i) / FALL_PATTERN_VSPAN);
    }
    geometry.userData.shared = true;
    fallQuadCache.set(key, geometry);
  }
  return geometry;
};

export const getWaterGroup = ({ position: [x, , z], rotation }: MapObject, ctx: BuildContext) => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();
  // El bloque de agua tiene esquinas redondeadas y caras de cascada
  // DIRECCIONALES (calculadas según los vecinos, en coordenadas de grilla).
  // Todo el contenido va en un subgrupo contra-rotado para que quede fijo a la
  // grilla aunque el tile se rote en edición (mismo criterio que el terreno).
  const content = new THREE.Group();

  // Esquinas redondeadas del bloque de agua y lados de caída (cascadas).
  let cornerMask = 0;
  const voidSides: Array<[number, number]> = [];
  if (ctx.tileXZ && ctx.neighborTypeAt) {
    const [tx, tz] = ctx.tileXZ;
    const isVoid = (neighbor?: MapObjectType) => neighbor === undefined || neighbor === MapObjectType.EMPTY;
    const isWater = (neighbor?: MapObjectType) => neighbor === MapObjectType.WATER;
    const nPX = ctx.neighborTypeAt(tx + 1, tz);
    const nNX = ctx.neighborTypeAt(tx - 1, tz);
    const nPZ = ctx.neighborTypeAt(tx, tz + 1);
    const nNZ = ctx.neighborTypeAt(tx, tz - 1);
    if (isVoid(nPX)) voidSides.push([1, 0]);
    if (isVoid(nNX)) voidSides.push([-1, 0]);
    if (isVoid(nPZ)) voidSides.push([0, 1]);
    if (isVoid(nNZ)) voidSides.push([0, -1]);
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
    waterMesh.position.set(x, WATER_ORIGIN_Y + WATER_HEIGHT / 2, z);
    content.add(waterMesh);
  } else {
    specs.push({ size: [TILE_SIZE, WATER_HEIGHT, TILE_SIZE], at: [0, 0, 0], color: palette.water, material: 'lambert', faceShade: true });
  }

  // Overlay de vetas por cara de caída, recortado donde la esquina se
  // redondea (para no flotar fuera de la curva).
  for (const [dx, dz] of voidSides) {
    const alongX = dz !== 0; // el borde expuesto corre a lo largo de x
    let start = -TILE_SIZE / 2;
    let end = TILE_SIZE / 2;
    const bitPos = alongX ? (dz === 1 ? 1 : 2) : dx === 1 ? 1 : 8;
    const bitNeg = alongX ? (dz === 1 ? 8 : 4) : dx === 1 ? 2 : 4;
    if (cornerMask & bitPos) end -= TILE_CORNER_RADIUS;
    if (cornerMask & bitNeg) start += TILE_CORNER_RADIUS;
    const mid = (start + end) / 2;
    // Fase propia por tile y lado, para que el patrón no se repita entre
    // cascadas vecinas (cuantizada a octavos: cache de geometrías acotado).
    const [tx, tz] = ctx.tileXZ ?? [0, 0];
    const phase = (((tx * 31 + tz * 17 + dx * 3 + dz * 5) % 8) + 8) % 8 / 8;
    // Material por tile (el dispose del rebuild no debe matar un singleton);
    // la TEXTURA sí es compartida — dispose de material no dispone texturas —
    // y su offset.y lo anima WaterBackground para todas las cascadas a la vez.
    // Lambert + receiveShadow: las vetas se oscurecen con la sombra de la
    // isla, como la cara del agua (con material sin luz brillaban en sombra).
    const quad = new THREE.Mesh(
      getSharedFallQuadGeometry(end - start, phase),
      new THREE.MeshLambertMaterial({ map: getFallStreaksTexture(), transparent: true, depthWrite: false })
    );
    quad.receiveShadow = true;
    // PlaneGeometry mira a +z; rotarla hacia afuera del lado expuesto.
    quad.rotation.y = alongX ? (dz === 1 ? 0 : Math.PI) : dx === 1 ? Math.PI / 2 : -Math.PI / 2;
    // El quad está centrado: va al CENTRO del bloque (origin), no a su tope.
    quad.position.set(
      x + (alongX ? mid : dx * (TILE_SIZE / 2 + 0.008)),
      WATER_ORIGIN_Y,
      z + (alongX ? dz * (TILE_SIZE / 2 + 0.008) : mid)
    );
    quad.castShadow = false;
    content.add(quad);
  }

  addBoxes(content, [x, WATER_ORIGIN_Y, z], specs);

  content.rotation.y = -(rotation?.[1] ?? 0);
  group.add(content);

  return group;
};
