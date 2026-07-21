import { MapObject, MapObjectType, ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import * as THREE from 'three';
import { MAP_SIZE, TILE_HEIGHT } from './constants';

// Lookup (x,z) → tipo de tile para el BuildContext.neighborTypeAt: pasto y
// agua lo usan para dibujar el contorno del mapa solo en lados expuestos.
export const makeNeighborTypeLookup = (mapObjects: MapObject[]): ((x: number, z: number) => MapObjectType | undefined) => {
  const types = new Map<string, MapObjectType>();
  for (const mapObject of mapObjects) {
    types.set(`${mapObject.position[0]}|${mapObject.position[2]}`, mapObject.type);
  }
  return (x, z) => types.get(`${x}|${z}`);
};

// Utilidades de Three.js compartidas por los builders de tiles/objects y los
// edificios. La creación de objetos por tipo vive en tiles/registry.ts.

/** Centro Y de una caja de `height` cuyo tope queda al nivel del suelo (y=0). */
export const getY_0 = (height: number) => {
  return -TILE_HEIGHT + height / 2;
};

/** Centro Y de una caja de `height` apoyada sobre el suelo (y=0). */
export const getY_1 = (height: number) => {
  return height / 2;
};

export const getAddMesh =
  (group: THREE.Group) => (geom: THREE.BoxGeometry, material: THREE.Material, pos: [number, number, number]) => {
    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(pos[0], pos[1], pos[2]);
    group.add(mesh);
  };

export const objectSelectUp = (threeObject: THREE.Object3D<THREE.Object3DEventMap>, color = '#22c55e') => {
  const mesh = threeObject as THREE.Mesh;
  if (!mesh?.isMesh) {
    return;
  }
  const mat = mesh?.material;
  if (!mat || Array.isArray(mat)) {
    return;
  }
  const m = mat as THREE.MeshStandardMaterial;
  if ('emissive' in m) {
    m.emissive = new THREE.Color(color);
  }
  if ('emissiveIntensity' in m) {
    m.emissiveIntensity = 0.6;
  }
  return;
};

export const objectSelectDown = (threeObject: THREE.Object3D<THREE.Object3DEventMap>) => {
  const mesh = threeObject as THREE.Mesh;
  if (!mesh?.isMesh) {
    return;
  }
  const mat = mesh?.material;
  if (!mat || Array.isArray(mat)) {
    return;
  }
  const m = mat as THREE.MeshStandardMaterial;
  if ('emissiveIntensity' in m) {
    m.emissiveIntensity = 0;
  }
};

// Libera geometrías y materiales de un grupo construido con los builders de
// tiles/objects/*. Sin esto, cada reconstrucción del mapa deja recursos
// huérfanos en la GPU. Las geometrías del cache compartido (recipe.ts) se
// saltan: viven durante toda la sesión y las reusan todos los tiles.
export const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry?.userData?.shared) {
      mesh.geometry?.dispose();
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material?.dispose());
  });
};

export function getMapCenter(tiles: ProfileMapObjectsResponseDTO['objects']) {
  // Sin tiles (mapa nuevo vacío, o aún no llega el API): centro de la grilla
  // de edición, así la cámara apunta al lugar donde se colocan los bloques.
  // (Math.min() de un array vacío es Infinity y rompería cámara y controles.)
  if (tiles.length === 0) {
    return [(MAP_SIZE - 1) / 2, -2, (MAP_SIZE - 1) / 2] as [number, number, number];
  }
  const xPositions = tiles.map((tile: MapObject) => tile.position[0]);
  const zPositions = tiles.map((tile: MapObject) => tile.position[2]);

  const centerX = (Math.min(...xPositions) + Math.max(...xPositions)) / 2;
  const centerZ = (Math.min(...zPositions) + Math.max(...zPositions)) / 2;

  return [centerX, -2, centerZ] as [number, number, number];
}
