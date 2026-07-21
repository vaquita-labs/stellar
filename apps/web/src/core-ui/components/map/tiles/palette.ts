import { WorldType } from '@/core-ui/types';

// Paleta única del mapa 3D: TODOS los colores de los tiles viven acá, por
// mundo. Para cambiar el look del mapa (restyle) se edita este archivo y las
// recetas en objects/*, nada más.
export interface WorldPalette {
  // bloque de terreno base (pasto arriba, tierra abajo)
  grassTop: string;
  /** tono alterno del pasto para el damero sutil del suelo */
  grassTopAlt: string;
  dirt: string;
  dirtDark: string;
  // tiles simples
  water: string;
  /** mar de fondo (WaterBackground) y falda de olas contra el acantilado */
  ocean: string;
  /** espuma de la cascada (vetas de la cortina y motas al pie) */
  foam: string;
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
  // flores (arbustos florecidos y parches): dos especies + centro compartido
  /** pétalos cálidos (naranja/coral) */
  flowerWarm: string;
  /** pétalos claros (blanco crema) */
  flowerLight: string;
  /** centro amarillo de todas las flores */
  flowerCore: string;
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
  trunk: '#B5875A',
  leaf: '#A8C95F',
  leafDark: '#5CA904',
  cactus: '#4CAF50',
  flowerWarm: '#FF8A4A',
  flowerLight: '#FFF4E0',
  flowerCore: '#FFD95C',
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
    grassTopAlt: '#AAD666',
    // mismo tono que las rocas, para que acantilados y piedras sean una familia
    dirt: '#A4876A',
    dirtDark: '#8B7355',
    water: '#7DCBEC',
    ocean: '#5FB9E2',
    foam: '#EDF8FC',
    treeTerrain: '#C35838',
    bushTerrain: '#C6E646',
  },
  [WorldType.DESERT]: {
    ...COMMON,
    grassTop: '#FFE49A',
    grassTopAlt: '#F6DA8C',
    dirt: '#D9B36A',
    dirtDark: '#B8924F',
    water: '#4DB8E8',
    ocean: '#2E8FD6',
    foam: '#EDF8FC',
    treeTerrain: '#8B6F47',
    bushTerrain: '#FFB24A',
  },
  [WorldType.VOLCANO]: {
    ...COMMON,
    grassTop: '#624D4A',
    grassTopAlt: '#6A5450',
    dirt: '#3E2F2D',
    dirtDark: '#2C2120',
    water: '#FF9C1C',
    ocean: '#E0791A',
    foam: '#FFDD9E',
    treeTerrain: '#C2583B',
    bushTerrain: '#7B4F50',
  },
};

export const getPalette = (worldType: WorldType): WorldPalette =>
  WORLD_PALETTES[worldType] || WORLD_PALETTES[WorldType.FOREST];
