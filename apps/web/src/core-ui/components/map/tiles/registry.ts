import { MapObject, MapObjectType, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import {
  getBankGroup,
  getBarnGroup,
  getBushGroup,
  getGrassGroup,
  getLeaderboardGroup,
  getRoadGroup,
  getRockGroup,
  getTreeGroup,
  getWaterGroup,
} from './objects';

// ---------------------------------------------------------------------------
// Registro único tipo → builder. Cualquier código que necesite materializar
// un tile (Ground, previews del catálogo, snapshot del leaderboard) pasa por
// acá; para agregar un tipo nuevo se agrega UNA entrada.
// ---------------------------------------------------------------------------

export interface BuildContext {
  worldType: WorldType;
  /** Fuente para los edificios con texto 3D (banco, podio). */
  font?: Font | null;
}

type ObjectBuilder = (mapObject: MapObject, ctx: BuildContext) => THREE.Object3D;

// Plano invisible para que los tiles EMPTY sean clickeables en modo edición.
const getEmptyHitPlane: ObjectBuilder = ({ position }) => {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = position[1];
  return plane;
};

const BUILDERS: Partial<Record<MapObjectType, ObjectBuilder>> = {
  [MapObjectType.WATER]: (o, { worldType }) => getWaterGroup(o, worldType),
  [MapObjectType.ROCK]: (o, { worldType }) => getRockGroup(o, worldType),
  [MapObjectType.GRASS]: (o, { worldType }) => getGrassGroup(o, worldType),
  [MapObjectType.BUSH]: (o, { worldType }) => getBushGroup(o, worldType),
  [MapObjectType.TREE]: (o, { worldType }) => getTreeGroup(o, worldType),
  [MapObjectType.ROAD]: (o, { worldType }) => getRoadGroup(o, worldType),
  [MapObjectType.BANK]: (o, { worldType, font }) => getBankGroup(o, worldType, font ?? null),
  [MapObjectType.LEADERBOARD]: (o, { worldType, font }) => getLeaderboardGroup(o, worldType, font ?? null),
  [MapObjectType.BARN]: (o, { worldType }) => getBarnGroup(o, worldType),
  [MapObjectType.EMPTY]: getEmptyHitPlane,
};

// Tipos que Ground solo materializa en modo edición: en modo normal los
// edificios los renderizan los componentes React de buildings/ (con monedas e
// interacción) y los EMPTY directamente no se dibujan.
export const EDIT_ONLY_TYPES: ReadonlySet<MapObjectType> = new Set([
  MapObjectType.BANK,
  MapObjectType.LEADERBOARD,
  MapObjectType.BARN,
  MapObjectType.EMPTY,
]);

export const buildTileObject = (mapObject: MapObject, ctx: BuildContext): THREE.Object3D | null =>
  BUILDERS[mapObject.type]?.(mapObject, ctx) ?? null;

// Igual que buildTileObject pero con fallback a GRASS para tipos desconocidos.
// Lo usan los previews (catálogo de edición, snapshot del leaderboard).
export const getObjectGroup = (mapObject: MapObject, worldType: WorldType): THREE.Object3D =>
  buildTileObject(mapObject, { worldType }) ?? getGrassGroup(mapObject, worldType);
