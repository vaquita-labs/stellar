import { WorldType } from '@/core-ui/types';
import { makeCatalog, Variant } from '../catalog-kit';

// Catálogo de COLECCIONABLES Y RECOMPENSAS (ítems que se ganan/otorgan y se
// colocan en el mapa: trofeos, cofres, medallas, etc.). Vacío por ahora.
//
// Para agregar: creá shapes/miColeccionable.ts, sumá una entrada en VARIANTS y
// su nombre AL FINAL del array del mundo en ORDER (ver decoration/catalog.ts).

const VARIANTS: Record<string, Variant> = {};
const ORDER: Partial<Record<WorldType, string[]>> = {};

export const getCollectibleRecipe = makeCatalog(VARIANTS, ORDER);
