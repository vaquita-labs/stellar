import { MapObject, MapObjectType, WorldType } from '@/core-ui/types';
import * as THREE from 'three';
import { BUILDINGS } from '../buildings/registry';
import { BuildContext, ObjectBuilder } from '../types';
import {
  getBushGroup,
  getGrassGroup,
  getRoadGroup,
  getRockGroup,
  getTreeGroup,
  getWaterGroup,
} from './objects';

// ---------------------------------------------------------------------------
// Registro único tipo → builder. Cualquier código que necesite materializar
// un tile (Ground, previews del catálogo, snapshot del leaderboard) pasa por
// acá. Los tiles simples se registran abajo; los edificios vienen del registro
// de buildings/registry.tsx (una sola fuente para geometría + componente).
// ---------------------------------------------------------------------------

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

const buildingBuilders = Object.fromEntries(
  Object.entries(BUILDINGS).map(([type, definition]) => [type, definition.build])
) as Partial<Record<MapObjectType, ObjectBuilder>>;

const BUILDERS: Partial<Record<MapObjectType, ObjectBuilder>> = {
  [MapObjectType.WATER]: (o, ctx) => getWaterGroup(o, ctx),
  [MapObjectType.ROCK]: (o, ctx) => getRockGroup(o, ctx),
  [MapObjectType.GRASS]: (o, ctx) => getGrassGroup(o, ctx),
  [MapObjectType.BUSH]: (o, ctx) => getBushGroup(o, ctx),
  [MapObjectType.TREE]: (o, ctx) => getTreeGroup(o, ctx),
  [MapObjectType.ROAD]: (o, { worldType }) => getRoadGroup(o, worldType),
  ...buildingBuilders,
  [MapObjectType.EMPTY]: getEmptyHitPlane,
};

// Tipos que Ground solo materializa en modo edición: en modo normal los
// edificios los renderizan los componentes React de buildings/ (con extras e
// interacción) y los EMPTY directamente no se dibujan.
export const EDIT_ONLY_TYPES: ReadonlySet<MapObjectType> = new Set([
  ...(Object.keys(BUILDINGS) as MapObjectType[]),
  MapObjectType.EMPTY,
]);

export const buildTileObject = (mapObject: MapObject, ctx: BuildContext): THREE.Object3D | null =>
  BUILDERS[mapObject.type]?.(mapObject, ctx) ?? null;

// Igual que buildTileObject pero con fallback a GRASS para tipos desconocidos
// y para EMPTY (cuyo builder es un plano invisible que solo sirve en edición).
// Lo usan los previews (catálogo de edición, snapshot del leaderboard).
//
// El tile va como una isla suelta: se le declara EMPTY a los cuatro vecinos
// para que addTerrainTile le dibuje el contorno completo (delineado del pasto
// y de la tierra de abajo). Sin esto el preview salía sin líneas mientras que
// el mismo objeto en el mapa sí las tiene.
const STANDALONE_CTX = (worldType: WorldType): BuildContext => ({
  worldType,
  tileXZ: [0, 0],
  neighborTypeAt: () => MapObjectType.EMPTY,
});

export const getObjectGroup = (mapObject: MapObject, worldType: WorldType): THREE.Object3D => {
  const ctx = STANDALONE_CTX(worldType);
  if (mapObject.type === MapObjectType.EMPTY) {
    return getGrassGroup(mapObject, ctx);
  }
  return buildTileObject(mapObject, ctx) ?? getGrassGroup(mapObject, ctx);
};
