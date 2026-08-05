import { MapObject, MapObjectType } from '@/core-ui/types';
import * as THREE from 'three';
import { TILE_SIZE } from '@/core-ui/components/map/constants';
import { BuildContext } from '@/core-ui/components/map/types';
import { getPalette } from '@/core-ui/components/map/tiles/palette';
import { addBoxes, addFixedTerrainTile, BoxSpec } from '@/core-ui/components/map/tiles/recipe';

// ---------------------------------------------------------------------------
// Camino empedrado con AUTOTILING. Cada tile mira sus 4 vecinos de grilla: si
// son ROAD, extiende el empedrado hacia ese lado. Con los 4 vecinos → todo
// adoquín; 2 opuestos → recto; 2 adyacentes → curva; 3 → T; 1 → punta; 0 →
// parche central. El patrón se calcula en COORDENADAS DE GRILLA y se
// CONTRA-ROTA por -userRotation (como el terreno) para que siga alineado a la
// grilla y empalme con los vecinos aunque el usuario rote (ver addFixedTerrainTile).
//
// Optimización: los adoquines usan un set FIJO de tamaños/colores (geometría
// compartida vía getSharedBoxGeometry) → el instancing de staticWorld los
// colapsa a pocos draw calls sin importar cuántos tiles de camino haya.
// ---------------------------------------------------------------------------

const TOON = { material: 'toon', faceShade: true, receiveShadow: false } as const;
const N = 5; // celdas por lado
const CELL = TILE_SIZE / N;
const MORTAR = '#B49A72'; // tierra/junta entre adoquines
const COBBLE = ['#CFC8B6', '#BEB6A2', '#C6BDA8']; // piedras (variación)
const COBBLE_SIZE = [0.92 * CELL, 0.8 * CELL, CELL]; // tamaños fijos → geometría compartida

interface Mask {
  E: boolean;
  W: boolean;
  N: boolean;
  S: boolean;
}

/** Celda (i,j) del 5×5 que es camino según los vecinos conectados. */
const isPath = (i: number, j: number, m: Mask): boolean => {
  const cx = i >= 1 && i <= 3;
  const cz = j >= 1 && j <= 3;
  if (cx && cz) return true; // núcleo 3×3
  if (m.E && i >= 3 && cz) return true; // brazo +x
  if (m.W && i <= 1 && cz) return true; // brazo −x
  if (m.N && j >= 3 && cx) return true; // brazo +z
  if (m.S && j <= 1 && cx) return true; // brazo −z
  if (m.E && m.N && i >= 3 && j >= 3) return true; // esquinas (curvas)
  if (m.W && m.N && i <= 1 && j >= 3) return true;
  if (m.E && m.S && i >= 3 && j <= 1) return true;
  if (m.W && m.S && i <= 1 && j <= 1) return true;
  return false;
};

// Jitter determinístico y estable por celda + tile (no titila entre frames).
const hash = (a: number, b: number, c: number, d: number): number => {
  const s = Math.sin(a * 12.9 + b * 78.2 + c * 37.1 + d * 13.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Adoquines + junta de tierra de las celdas de camino (relativo al centro del tile, base en y=0). */
const roadRecipe = (mask: Mask, tx: number, tz: number): BoxSpec[] => {
  const specs: BoxSpec[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (!isPath(i, j, mask)) continue;
      const u = -TILE_SIZE / 2 + CELL / 2 + i * CELL;
      const v = -TILE_SIZE / 2 + CELL / 2 + j * CELL;
      // Junta de tierra que rellena la celda, apenas sobre el pasto.
      specs.push({ ...TOON, size: [CELL + 0.005, 0.05, CELL + 0.005], at: [u, 0.02, v], color: MORTAR, bevel: 0, castShadow: false });
      // Adoquín redondeado con jitter estable.
      const h1 = hash(i, j, tx, tz);
      const h2 = hash(j, i, tz, tx);
      const h3 = hash(i + 1, j + 2, tx, tz);
      const sz = COBBLE_SIZE[Math.floor(h3 * 3)];
      specs.push({
        ...TOON,
        size: [sz, 0.09, sz],
        at: [u + (h1 - 0.5) * 0.04, 0.055, v + (h2 - 0.5) * 0.04],
        color: COBBLE[Math.floor(h1 * 3)],
        bevel: 0.045,
        rotationY: (h2 - 0.5) * 0.8,
        castShadow: false,
      });
    }
  }
  return specs;
};

export const getRoadGroup = ({ position: [x, , z], rotation }: MapObject, ctx: BuildContext) => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();
  const rotY = rotation?.[1] ?? 0;

  // Base de PASTO fija a la grilla (cap + tierra + contorno de costa), contra-rotada.
  addFixedTerrainTile(group, x, z, palette.treeTerrain, ctx, rotY);

  // Máscara de conexión desde los vecinos de grilla que también son ROAD.
  const [tx, tz] = ctx.tileXZ ?? [0, 0];
  const isRoad = (a: number, b: number) => ctx.neighborTypeAt?.(a, b) === MapObjectType.ROAD;
  const mask: Mask = { E: isRoad(tx + 1, tz), W: isRoad(tx - 1, tz), N: isRoad(tx, tz + 1), S: isRoad(tx, tz - 1) };

  // Empedrado en un subgrupo CONTRA-ROTADO: el patrón es direccional (grilla),
  // así queda alineado y empalma con los vecinos aunque el objeto rote.
  const cobbles = new THREE.Group();
  cobbles.rotation.y = -rotY;
  addBoxes(cobbles, [x, 0, z], roadRecipe(mask, tx, tz));
  group.add(cobbles);

  return group;
};
