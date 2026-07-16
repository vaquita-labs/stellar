import { MapObjectType } from '@/core-ui/types';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TILE_HEIGHT, TILE_SIZE } from '../constants';
import { BuildContext } from '../types';
import { getPalette } from './palette';

// Una "receta" describe un objeto del mapa como una lista de cajas (tamaño,
// offset, color). Los builders en objects/* componen recetas en vez de crear
// meshes a mano: agregar una variante nueva es agregar datos, no código.
export interface BoxSpec {
  /** [ancho, alto, profundidad] */
  size: [number, number, number];
  /** offset respecto del origen que recibe addBoxes */
  at: [number, number, number];
  color: string;
  /**
   * 'standard' reacciona mejor a la luz; 'lambert' es más barato; 'toon' es
   * cel-shading (la luz se corta en bandas planas por cara); 'basic' ignora
   * la luz (color plano, para trazos dibujados). Default: 'standard'.
   */
  material?: 'standard' | 'lambert' | 'toon' | 'basic';
  /** radio de biselado de esquinas en unidades de mundo (esquinas redondeadas) */
  bevel?: number;
  /**
   * hornea un tono fijo por cara en la geometría (vertex colors): tope claro,
   * caras laterales en dos tonos, base oscura. Garantiza el look cel-shaded
   * desde cualquier ángulo de cámara/sol, independiente de la luz de escena.
   */
  faceShade?: boolean;
  /**
   * grosor en unidades de mundo del contorno oscuro: una copia de la caja
   * apenas más grande con caras invertidas (inverted hull), que dibuja la
   * silueta del objeto según el ángulo de cámara.
   */
  outline?: number;
  /** default true */
  castShadow?: boolean;
  /** default true */
  receiveShadow?: boolean;
}

export const OUTLINE_COLOR = '#1f1a12';

// Gradient map compartido del cel-shading: 3 bandas de luz (sombra, media,
// plena). NearestFilter es lo que corta la luz en escalones en vez de
// interpolarla. Singleton de sesión: material.dispose() no dispone texturas,
// así que sobrevive a los rebuilds del mapa.
let toonGradientMap: THREE.DataTexture | null = null;
const getToonGradientMap = (): THREE.DataTexture => {
  if (!toonGradientMap) {
    const bands = new Uint8Array([120, 190, 255]);
    toonGradientMap = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat);
    toonGradientMap.minFilter = THREE.NearestFilter;
    toonGradientMap.magFilter = THREE.NearestFilter;
    toonGradientMap.needsUpdate = true;
  }
  return toonGradientMap;
};

// Cache global de BoxGeometry por dimensiones. Las geometrías nunca se mutan
// (la posición vive en el mesh), así que compartirlas entre tiles es seguro y
// evita crear/disponer cientos de geometrías idénticas en cada rebuild del
// mapa. disposeObject (helpers.ts) las respeta vía userData.shared.
const geometryCache = new Map<string, THREE.BoxGeometry>();

// Tonos por cara del faceShade. Caras x y z distintas para que cualquier vista
// en esquina muestre siempre dos laterales de tono diferente, como en el
// cel-shading de referencia. En los biseles el normal interpola y el tono
// transiciona suave.
const SHADE_TOP = 1.0;
const SHADE_X = 0.78;
const SHADE_Z = 0.9;
const SHADE_BOTTOM = 0.55;

const applyFaceShade = (geometry: THREE.BufferGeometry) => {
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const nx = Math.abs(normals.getX(i));
    const ny = normals.getY(i);
    const nz = Math.abs(normals.getZ(i));
    const side = nx + nz > 0 ? (nx * SHADE_X + nz * SHADE_Z) / (nx + nz) : SHADE_X;
    const shade = ny >= 0 ? side + (SHADE_TOP - side) * ny : side + (SHADE_BOTTOM - side) * -ny;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
};

export const getSharedBoxGeometry = (width: number, height: number, depth: number, bevel = 0, faceShade = false): THREE.BoxGeometry => {
  const key = `${width}|${height}|${depth}|${bevel}|${faceShade}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    // RoundedBoxGeometry extiende BoxGeometry; 4 segmentos alcanzan para que
    // el bisel se lea redondeado a la escala de un tile.
    geometry = bevel > 0 ? new RoundedBoxGeometry(width, height, depth, 4, bevel) : new THREE.BoxGeometry(width, height, depth);
    if (faceShade) applyFaceShade(geometry);
    geometry.userData.shared = true;
    geometryCache.set(key, geometry);
  }
  return geometry;
};

// Radio en planta de las esquinas de la costa (donde el terreno dobla).
const TILE_CORNER_RADIUS = 0.24;

// Geometría de tile con esquinas redondeadas EN PLANTA solo donde la costa
// dobla (bits del mask: 1=+x+z, 2=+x-z, 4=-x-z, 8=-x+z). Los lados rectos
// quedan al ras del tile vecino — sin surcos —, y la curva solo aparece en la
// silueta de la isla/orillas, como el diseño de la app. El sólido ocupa
// y ∈ [-height, 0] respecto del origen del mesh.
const roundedTileCache = new Map<string, THREE.BufferGeometry>();
export const getSharedRoundedTileGeometry = (height: number, mask: number, faceShade: boolean): THREE.BufferGeometry => {
  const key = `${height}|${mask}|${faceShade}`;
  let geometry = roundedTileCache.get(key);
  if (!geometry) {
    const hw = TILE_SIZE / 2;
    const r = TILE_CORNER_RADIUS;
    const r1 = mask & 1 ? r : 0; // esquina (+x, +z)
    const r2 = mask & 2 ? r : 0; // esquina (+x, -z)
    const r4 = mask & 4 ? r : 0; // esquina (-x, -z)
    const r8 = mask & 8 ? r : 0; // esquina (-x, +z)
    // Shape en el plano (x, z); la extrusión se rota para crecer hacia -y.
    const shape = new THREE.Shape();
    shape.moveTo(-hw + r4, -hw);
    shape.lineTo(hw - r2, -hw);
    if (r2) shape.quadraticCurveTo(hw, -hw, hw, -hw + r2);
    shape.lineTo(hw, hw - r1);
    if (r1) shape.quadraticCurveTo(hw, hw, hw - r1, hw);
    shape.lineTo(-hw + r8, hw);
    if (r8) shape.quadraticCurveTo(-hw, hw, -hw, hw - r8);
    shape.lineTo(-hw, -hw + r4);
    if (r4) shape.quadraticCurveTo(-hw, -hw, -hw + r4, -hw);
    geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 5 });
    // (x, y, 0..h) → (x, 0..-h, z): la cara del shape queda como tope en y=0.
    geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();
    if (faceShade) applyFaceShade(geometry);
    geometry.userData.shared = true;
    roundedTileCache.set(key, geometry);
  }
  return geometry;
};

// Agrega las cajas de una receta al grupo. Los materiales se comparten por
// color DENTRO del grupo, nunca globalmente: el modo edición muta color y
// emissive del material al hacer hover (EditableObjectGroup), y un material
// global contagiaría el highlight a todos los tiles del mismo color.
export const addBoxes = (group: THREE.Group, origin: [number, number, number], specs: readonly BoxSpec[]) => {
  const materials = new Map<string, THREE.Material>();
  const getMaterial = (key: string, create: () => THREE.Material): THREE.Material => {
    let material = materials.get(key);
    if (!material) {
      material = create();
      materials.set(key, material);
    }
    return material;
  };
  for (const spec of specs) {
    const kind = spec.material ?? 'standard';
    const vertexColors = spec.faceShade ?? false;
    const material = getMaterial(`${kind}|${spec.color}|${vertexColors}`, () => {
      if (kind === 'lambert') return new THREE.MeshLambertMaterial({ color: spec.color, vertexColors });
      if (kind === 'toon') return new THREE.MeshToonMaterial({ color: spec.color, gradientMap: getToonGradientMap(), vertexColors });
      if (kind === 'basic') return new THREE.MeshBasicMaterial({ color: spec.color, vertexColors });
      return new THREE.MeshStandardMaterial({ color: spec.color, vertexColors });
    });
    const geometry = getSharedBoxGeometry(...spec.size, spec.bevel ?? 0, vertexColors);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = spec.castShadow ?? true;
    mesh.receiveShadow = spec.receiveShadow ?? true;
    mesh.position.set(origin[0] + spec.at[0], origin[1] + spec.at[1], origin[2] + spec.at[2]);
    group.add(mesh);

    if (spec.outline) {
      // Contorno inverted-hull: misma geometría compartida escalada en el mesh
      // (nunca se muta la geometría) para engordar `outline` unidades de mundo
      // por lado, con solo las caras traseras visibles.
      const [w, h, d] = spec.size;
      const t = spec.outline;
      const outlineMaterial = getMaterial('outline', () => new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }));
      const outlineMesh = new THREE.Mesh(geometry, outlineMaterial);
      outlineMesh.scale.set((w + 2 * t) / w, (h + 2 * t) / h, (d + 2 * t) / d);
      outlineMesh.castShadow = false;
      outlineMesh.receiveShadow = false;
      outlineMesh.position.copy(mesh.position);
      group.add(outlineMesh);
    }
  }
};

// Relleno de esquina: la lúnula entre la esquina cuadrada del tile y la curva
// de la costa (mismo bezier que getSharedRoundedTileGeometry). Cuando la costa
// dobla contra agua, un relleno color agua ocupa ese recorte para que el agua
// siga la forma del terreno. Construida para la esquina (+x, +z); las demás se
// obtienen rotando el mesh en pasos de 90°. Ocupa y ∈ [-height, 0].
const cornerFillerCache = new Map<string, THREE.BufferGeometry>();
export const getSharedCornerFillerGeometry = (height: number): THREE.BufferGeometry => {
  const key = `${height}`;
  let geometry = cornerFillerCache.get(key);
  if (!geometry) {
    const hw = TILE_SIZE / 2;
    const r = TILE_CORNER_RADIUS;
    const shape = new THREE.Shape();
    shape.moveTo(hw - r, hw);
    shape.lineTo(hw, hw);
    shape.lineTo(hw, hw - r);
    shape.quadraticCurveTo(hw, hw, hw - r, hw);
    geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 5 });
    geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();
    geometry.userData.shared = true;
    cornerFillerCache.set(key, geometry);
  }
  return geometry;
};

// Bloque base que ocupa el tile completo bajo un objeto, con la misma
// estructura que el tile de pasto: capa superior del color del objeto y
// tierra debajo, para que en los bordes de la isla se lea igual que el resto
// del terreno.
export const addTerrainTile = (group: THREE.Group, x: number, z: number, color: string, ctx: BuildContext) => {
  const capHeight = TILE_HEIGHT * 0.2;
  const dirtHeight = TILE_HEIGHT - capHeight;
  const palette = getPalette(ctx.worldType);

  // Esquinas de costa: donde dos lados adyacentes están expuestos (borde de
  // isla, hueco u orilla de agua), el terreno dobla y se redondea en planta.
  const isExposed = (neighbor?: MapObjectType) =>
    neighbor === undefined || neighbor === MapObjectType.EMPTY || neighbor === MapObjectType.WATER;
  let cornerMask = 0;
  const fillers: Array<{ rotation: number; color: string }> = [];
  if (ctx.tileXZ && ctx.neighborTypeAt) {
    const [tx, tz] = ctx.tileXZ;
    const typePX = ctx.neighborTypeAt(tx + 1, tz);
    const typeNX = ctx.neighborTypeAt(tx - 1, tz);
    const typePZ = ctx.neighborTypeAt(tx, tz + 1);
    const typeNZ = ctx.neighborTypeAt(tx, tz - 1);
    const corners: Array<[number, MapObjectType | undefined, MapObjectType | undefined, number]> = [
      [1, typePX, typePZ, 0],
      [2, typePX, typeNZ, Math.PI / 2],
      [4, typeNX, typeNZ, Math.PI],
      [8, typeNX, typePZ, -Math.PI / 2],
    ];
    for (const [bit, sideA, sideB, rotation] of corners) {
      if (!isExposed(sideA) || !isExposed(sideB)) continue;
      cornerMask |= bit;
      // La costa dobla contra agua: el agua rellena la esquina recortada.
      if (sideA === MapObjectType.WATER || sideB === MapObjectType.WATER) {
        fillers.push({ rotation, color: palette.water });
      }
    }
  }

  const dirtMat = new THREE.MeshLambertMaterial({ color: palette.dirt });
  if (cornerMask) {
    // Capa de color + tierra con las esquinas de costa redondeadas.
    const capMat = new THREE.MeshLambertMaterial({ color, vertexColors: true });
    const capMesh = new THREE.Mesh(getSharedRoundedTileGeometry(capHeight, cornerMask, true), capMat);
    capMesh.castShadow = true;
    capMesh.receiveShadow = true;
    capMesh.position.set(x, 0, z);
    group.add(capMesh);

    const dirtMesh = new THREE.Mesh(getSharedRoundedTileGeometry(dirtHeight, cornerMask, false), dirtMat);
    dirtMesh.castShadow = true;
    dirtMesh.receiveShadow = true;
    dirtMesh.position.set(x, -capHeight, z);
    group.add(dirtMesh);

    // El agua ocupa las esquinas recortadas contra ella (desde su superficie
    // en y=-0.2 hasta el fondo del bloque de agua vecino).
    for (const { rotation, color: fillerColor } of fillers) {
      const filler = new THREE.Mesh(
        getSharedCornerFillerGeometry(TILE_HEIGHT * 0.8),
        new THREE.MeshLambertMaterial({ color: fillerColor })
      );
      filler.rotation.y = rotation;
      filler.position.set(x, -capHeight, z);
      filler.castShadow = false;
      filler.receiveShadow = true;
      group.add(filler);
    }
  } else {
    addBoxes(group, [x, 0, z], [
      { size: [TILE_SIZE, capHeight, TILE_SIZE], at: [0, -capHeight / 2, 0], color, material: 'lambert', faceShade: true },
    ]);

    // Tierra bajo la capa de color: materiales por cara (lados tierra, base
    // oscura), por eso no usa el formato de receta.
    const dirtBottomMat = new THREE.MeshLambertMaterial({ color: palette.dirtDark });
    const dirtMesh = new THREE.Mesh(getSharedBoxGeometry(TILE_SIZE, dirtHeight, TILE_SIZE), [
      dirtMat,
      dirtMat,
      dirtMat,
      dirtBottomMat,
      dirtMat,
      dirtMat,
    ]);
    dirtMesh.castShadow = true;
    dirtMesh.receiveShadow = true;
    dirtMesh.position.set(x, -TILE_HEIGHT + dirtHeight / 2, z);
    group.add(dirtMesh);
  }

};
