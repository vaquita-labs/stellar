import { TILE_HEIGHT } from '@/core-ui/components/map/constants';

export const positionKey = (x: number, z: number) => `${x}-${z}`;
export const getTileTopY = (): number => TILE_HEIGHT / 2;
