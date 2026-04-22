import { getBankGroup, getBarnGroup, getLeaderboardGroup } from '@/core-ui/components/map/objects';
import { getBushGroup } from '@/core-ui/components/map/objects/bush';
import { getGrassGroup } from '@/core-ui/components/map/objects/grass';
import { getRoadGroup } from '@/core-ui/components/map/objects/road';
import { getRockGroup } from '@/core-ui/components/map/objects/rock';
import { getTreeGroup } from '@/core-ui/components/map/objects/tree';
import { getWaterGroup } from '@/core-ui/components/map/objects/water';
import { TILE_HEIGHT } from '@/core-ui/components/templates/WorldMap/vaquita/constants';
import { MapObject, MapObjectType, ProfileMapObjectsResponseDTO, WorldType } from '@/core-ui/types';
import * as THREE from 'three';

export const getY_0 = (height: number) => {
  return -TILE_HEIGHT + height / 2;
};

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

export const objectScaleUp = (threeObject: THREE.Object3D | undefined | null, mapObject: MapObject) => {
  if (threeObject && 'scale' in threeObject) {
    threeObject.scale.set(1.2, 1.2, 1.2);
  }
  if (threeObject && 'position' in threeObject) {
    threeObject.position.y = (mapObject?.position?.[1] || 0) + 0.02;
  }
};

export const objectScaleDown = (threeObject: THREE.Object3D | undefined | null, mapObject: MapObject | undefined) => {
  if (threeObject && 'scale' in threeObject) {
    threeObject.scale.set(1, 1, 1);
  }
  if (threeObject && 'position' in threeObject && mapObject?.position) {
    threeObject.position.y = mapObject.position?.[1] || 0;
  }
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

export const getObjectGroup = (mapObject: MapObject, worldType: WorldType) => {
  if (mapObject.type === MapObjectType.WATER) {
    return getWaterGroup(mapObject, worldType);
  } else if (mapObject.type === MapObjectType.ROCK) {
    return getRockGroup(mapObject, worldType);
  } else if (mapObject.type === MapObjectType.GRASS) {
    return getGrassGroup(mapObject, worldType);
  } else if (mapObject.type === MapObjectType.BUSH) {
    return getBushGroup(mapObject, worldType);
  } else if (mapObject.type === MapObjectType.TREE) {
    return getTreeGroup(mapObject, worldType);
  } else if (mapObject.type === MapObjectType.ROAD) {
    return getRoadGroup(mapObject, worldType);
  } else if (mapObject.type === MapObjectType.BANK) {
    return getBankGroup(mapObject, worldType, null);
  } else if (mapObject.type === MapObjectType.LEADERBOARD) {
    return getLeaderboardGroup(mapObject, worldType, null);
  } else if (mapObject.type === MapObjectType.BARN) {
    return getBarnGroup(mapObject, worldType);
  }
  return getGrassGroup(mapObject, worldType);
};
export function getMapCenter(tiles: ProfileMapObjectsResponseDTO['objects']) {
  const xPositions = tiles.map((tile) => tile.position[0]);
  const zPositions = tiles.map((tile) => tile.position[2]);

  const centerX = (Math.min(...xPositions) + Math.max(...xPositions)) / 2;
  const centerZ = (Math.min(...zPositions) + Math.max(...zPositions)) / 2;

  return [centerX, -2, centerZ] as [number, number, number];
}
