import { WorldType } from '@/core-ui/types';
import { makeCatalog, Variant } from '../catalog-kit';
import { pumpkin } from './shapes/pumpkin';

// Catálogo ESTACIONAL / temático (Halloween, navidad, etc.). La calabaza vive
// acá. HOY además se sirve como variante de TREE (ver vegetation/catalog.ts)
// para no migrar la DB; cuando se re-tipe a SEASONAL, este pasa a ser la única
// fuente y se quita de vegetación.

const VARIANTS = {
  jackOLantern: (p) => pumpkin(p.pumpkin, p.dark, p.leafDark, true),
} satisfies Record<string, Variant>;

// El ÍNDICE del array = el `variant` guardado en el mapa. NO reordenar/borrar.
const ORDER: Partial<Record<WorldType, (keyof typeof VARIANTS)[]>> = {
  [WorldType.FOREST]: ['jackOLantern'],
  [WorldType.DESERT]: ['jackOLantern'],
  [WorldType.VOLCANO]: ['jackOLantern'],
};

export const getSeasonalRecipe = makeCatalog(VARIANTS, ORDER);
