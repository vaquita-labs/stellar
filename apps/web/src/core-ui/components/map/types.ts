import { MapObject, ProfileMapObjectsResponseDTO, WorldType } from '@/core-ui/types';

export interface ObjectProps {
  x: number;
  z: number;
  worldType: WorldType;
  variant: number;
}

export interface GroundProps {
  mapObjects: ProfileMapObjectsResponseDTO['objects'];
  worldType: WorldType;
  onClickObject?: (object: MapObject) => void;
}
