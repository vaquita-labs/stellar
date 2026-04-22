export type TerrainType = 'grass' | 'water'  | 'road';
export type ObjectType = 'tree' | 'rock' | 'bush' | 'bank' | 'barn' | 'leaderboard' | null | 'empty'; 
export type TileType = TerrainType | ObjectType;
export type VaquitaAnimationState = 'walking' | 'working' | 'sleeping' | 'withdrawing' | 'celebrating' | 'sad';


export enum WorldType {
  DESERT = 'DESERT',
  VOLCANO = 'VOLCANO',
  FOREST = 'FOREST',
}

export type MapTile = {
  id: string;
  position: [number, number, number];
  terrain: TerrainType;
  object: ObjectType;
  variant?: number;
  beingWorked?: boolean;
};

