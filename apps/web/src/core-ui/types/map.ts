import { MapObjectType } from '@/core-ui/types/commons';

export type TileType = MapObjectType;
export type VaquitaAnimationState = 'walking' | 'working' | 'sleeping' | 'withdrawing' | 'celebrating' | 'sad';

export enum WorldType {
  DESERT = 'DESERT',
  VOLCANO = 'VOLCANO',
  FOREST = 'FOREST',
}
