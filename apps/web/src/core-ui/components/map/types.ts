import { MapObject, ProfileMapObjectsResponseDTO, WorldType } from '@/core-ui/types';
import type * as THREE from 'three';
import type { Font } from 'three/examples/jsm/loaders/FontLoader.js';

export interface ObjectProps {
  x: number;
  z: number;
  worldType: WorldType;
  variant: number;
}

// Contexto que reciben los builders de objetos/edificios al materializarse.
export interface BuildContext {
  worldType: WorldType;
  /** Fuente para los edificios con texto 3D (banco, podio). */
  font?: Font | null;
}

export type ObjectBuilder = (mapObject: MapObject, ctx: BuildContext) => THREE.Object3D;

export interface GroundProps {
  mapObjects: ProfileMapObjectsResponseDTO['objects'];
  worldType: WorldType;
  onClickObject?: (object: MapObject) => void;
}
