import * as THREE from 'three';
import { TILE_HEIGHT, TILE_SIZE } from '../constants';
import { getY_0 } from '../helpers';

// Una "receta" describe un objeto del mapa como una lista de cajas (tamaño,
// offset, color). Los builders en objects/* componen recetas en vez de crear
// meshes a mano: agregar una variante nueva es agregar datos, no código.
export interface BoxSpec {
  /** [ancho, alto, profundidad] */
  size: [number, number, number];
  /** offset respecto del origen que recibe addBoxes */
  at: [number, number, number];
  color: string;
  /** 'standard' reacciona mejor a la luz; 'lambert' es más barato. Default: 'standard'. */
  material?: 'standard' | 'lambert';
  /** default true */
  castShadow?: boolean;
  /** default true */
  receiveShadow?: boolean;
}

// Cache global de BoxGeometry por dimensiones. Las geometrías nunca se mutan
// (la posición vive en el mesh), así que compartirlas entre tiles es seguro y
// evita crear/disponer cientos de geometrías idénticas en cada rebuild del
// mapa. disposeObject (helpers.ts) las respeta vía userData.shared.
const geometryCache = new Map<string, THREE.BoxGeometry>();

export const getSharedBoxGeometry = (width: number, height: number, depth: number): THREE.BoxGeometry => {
  const key = `${width}|${height}|${depth}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.userData.shared = true;
    geometryCache.set(key, geometry);
  }
  return geometry;
};

// Agrega las cajas de una receta al grupo. Los materiales se comparten por
// color DENTRO del grupo, nunca globalmente: el modo edición muta color y
// emissive del material al hacer hover (EditableObjectGroup), y un material
// global contagiaría el highlight a todos los tiles del mismo color.
export const addBoxes = (group: THREE.Group, origin: [number, number, number], specs: readonly BoxSpec[]) => {
  const materials = new Map<string, THREE.Material>();
  for (const spec of specs) {
    const kind = spec.material ?? 'standard';
    const key = `${kind}|${spec.color}`;
    let material = materials.get(key);
    if (!material) {
      material =
        kind === 'lambert'
          ? new THREE.MeshLambertMaterial({ color: spec.color })
          : new THREE.MeshStandardMaterial({ color: spec.color });
      materials.set(key, material);
    }
    const mesh = new THREE.Mesh(getSharedBoxGeometry(...spec.size), material);
    mesh.castShadow = spec.castShadow ?? true;
    mesh.receiveShadow = spec.receiveShadow ?? true;
    mesh.position.set(origin[0] + spec.at[0], origin[1] + spec.at[1], origin[2] + spec.at[2]);
    group.add(mesh);
  }
};

// Bloque base 1×1×1 que ocupa el tile completo debajo del objeto.
export const addTerrainTile = (group: THREE.Group, x: number, z: number, color: string) => {
  addBoxes(group, [x, getY_0(TILE_HEIGHT), z], [{ size: [TILE_SIZE, TILE_HEIGHT, TILE_SIZE], at: [0, 0, 0], color }]);
};
