import { MapObject, MapObjectType, ProfileMapObjectsResponseDTO, WorldType } from '@/core-ui/types';
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
  /**
   * Coordenadas reales del tile en la grilla. Necesarias porque los callers
   * construyen los tiles en el origen (la posición la aplica el wrapper).
   */
  tileXZ?: [number, number];
  /**
   * Tipo del tile en (x,z), o undefined si no hay tile (fuera de la isla).
   * Permite a pasto/agua dibujar el contorno del mapa solo en los lados
   * expuestos. Los previews (catálogo, snapshot) no lo pasan: sin contorno.
   */
  neighborTypeAt?: (x: number, z: number) => MapObjectType | undefined;
}

export type ObjectBuilder = (mapObject: MapObject, ctx: BuildContext) => THREE.Object3D;

export interface GroundProps {
  mapObjects: ProfileMapObjectsResponseDTO['objects'];
  worldType: WorldType;
  onClickObject?: (object: MapObject) => void;
}
