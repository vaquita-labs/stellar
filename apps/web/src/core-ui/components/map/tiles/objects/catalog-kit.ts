import { WorldType } from '@/core-ui/types';
import { WorldPalette } from '@/core-ui/components/map/tiles/palette';
import { BoxSpec } from '@/core-ui/components/map/tiles/recipe';

// ---------------------------------------------------------------------------
// Kit de catálogo compartido por todas las categorías de objetos-receta
// (vegetación, decoración, estacional, coleccionables). Cada categoría define
// sus formas en shapes/*, las nombra en un mapa VARIANTS y las ordena por mundo;
// `makeCatalog` arma el resolver de recetas. Así agregar un ítem es declarativo.
// ---------------------------------------------------------------------------

/** Una forma (shapes/*) con los colores del mundo ya resueltos. */
export type Variant = (p: WorldPalette) => BoxSpec[];

/**
 * Arma el resolver de recetas de una categoría a partir de:
 *  - `variants`: nombre legible → forma con colores bindeados.
 *  - `order`: por mundo, la lista ordenada de nombres. El ÍNDICE del array es
 *    el `variant` del MapObject guardado en la DB: NO reordenar ni borrar
 *    (rompería mapas guardados); para agregar, sumá el nombre AL FINAL.
 *  - `fallbackWorld`: mundo cuyo orden se usa si el pedido no tiene lista.
 */
export const makeCatalog =
  <N extends string>(
    variants: Record<N, Variant>,
    order: Partial<Record<WorldType, N[]>>,
    fallbackWorld: WorldType = WorldType.FOREST
  ) =>
  (worldType: WorldType, variant: number, palette: WorldPalette): BoxSpec[] | null => {
    const names = order[worldType] ?? order[fallbackWorld];
    const name = names?.[variant];
    return name ? variants[name](palette) : null;
  };
