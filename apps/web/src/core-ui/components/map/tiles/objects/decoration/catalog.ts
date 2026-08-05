import { WorldType } from '@/core-ui/types';
import { makeCatalog, Variant } from '../catalog-kit';

// Catálogo de DECORACIÓN (props no funcionales: bancos, faroles, cercas,
// estatuas, etc.). Vacío por ahora — es el hogar para escalar decoraciones.
//
// Para agregar una decoración:
//   1. Creá shapes/miDeco.ts (la geometría, parametrizada por color).
//   2. Sumá una entrada en VARIANTS bindeando sus colores.
//   3. Sumá su nombre AL FINAL del array del mundo en ORDER.
// Ejemplo:
//   import { bench } from './shapes/bench';
//   const VARIANTS = { bench: (p) => bench(p.deadWood) } satisfies Record<string, Variant>;
//   const ORDER: Partial<Record<WorldType, (keyof typeof VARIANTS)[]>> = { [WorldType.FOREST]: ['bench'] };

const VARIANTS: Record<string, Variant> = {};
const ORDER: Partial<Record<WorldType, string[]>> = {};

export const getDecorationRecipe = makeCatalog(VARIANTS, ORDER);
