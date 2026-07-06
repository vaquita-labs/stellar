import { WorldType } from '@/core-ui/types';

// Paleta única del mapa 3D: TODOS los colores de los tiles viven acá, por
// mundo. Para cambiar el look del mapa (restyle) se edita este archivo y las
// recetas en objects/*, nada más.
export interface WorldPalette {
  // bloque de terreno base (pasto arriba, tierra abajo)
  grassTop: string;
  dirt: string;
  dirtDark: string;
  // tiles simples
  water: string;
  road: string;
  rock: string;
  // color del bloque base bajo árboles/arbustos
  treeTerrain: string;
  bushTerrain: string;
  // vegetación
  trunk: string;
  leaf: string;
  leafDark: string;
  cactus: string;
  bushBranch: string;
  // decoración
  pumpkin: string;
  deadWood: string;
  dark: string;
  sand: string;
  sandDark: string;
  bone: string;
}

// Colores que hoy son iguales en los tres mundos.
const COMMON = {
  road: '#000000',
  rock: '#A4876A',
  trunk: 'brown',
  leaf: '#9FFD53',
  leafDark: '#5CA904',
  cactus: '#4CAF50',
  bushBranch: '#72924C',
  pumpkin: '#FF6B1A',
  deadWood: '#5C4F47',
  dark: '#000000',
  sand: '#A4876A',
  sandDark: '#8B7355',
  bone: '#E8E8E8',
};

export const WORLD_PALETTES: Record<WorldType, WorldPalette> = {
  [WorldType.FOREST]: {
    ...COMMON,
    grassTop: '#A1CD5A',
    dirt: '#9B7653',
    dirtDark: '#7E5F42',
    water: '#6FF2F1',
    treeTerrain: '#C35838',
    bushTerrain: '#C6E646',
  },
  [WorldType.DESERT]: {
    ...COMMON,
    grassTop: '#FFE49A',
    dirt: '#D9B36A',
    dirtDark: '#B8924F',
    water: '#4DB8E8',
    treeTerrain: '#8B6F47',
    bushTerrain: '#FFB24A',
  },
  [WorldType.VOLCANO]: {
    ...COMMON,
    grassTop: '#624D4A',
    dirt: '#3E2F2D',
    dirtDark: '#2C2120',
    water: '#FF9C1C',
    treeTerrain: '#C2583B',
    bushTerrain: '#7B4F50',
  },
};

export const getPalette = (worldType: WorldType): WorldPalette =>
  WORLD_PALETTES[worldType] || WORLD_PALETTES[WorldType.FOREST];
