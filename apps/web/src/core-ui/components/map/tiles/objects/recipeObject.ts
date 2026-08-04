import { getTileTopY } from '@/core-ui/helpers/map';
import { BuildContext } from '@/core-ui/components/map/types';
import { getPalette, WorldPalette } from '@/core-ui/components/map/tiles/palette';
import { addBoxes, addFixedTerrainTile, BoxSpec } from '@/core-ui/components/map/tiles/recipe';
import { MapObject, WorldType } from '@/core-ui/types';
import * as THREE from 'three';

/** Resuelve la receta (lista de cajas) de un mundo + índice de variante. */
export type RecipeResolver = (worldType: WorldType, variant: number, palette: WorldPalette) => BoxSpec[] | null;

/**
 * Builder genérico de las categorías de objetos-receta (vegetación, decoración,
 * estacional, coleccionables): arma el terreno del tile (contra-rotado, fijo a
 * la grilla) y coloca encima la receta de la variante. Cada categoría solo
 * aporta su `resolve` (de makeCatalog); el resto es común.
 */
export const buildRecipeObject = (
  { position: [x, , z], variant, rotation }: MapObject,
  ctx: BuildContext,
  resolve: RecipeResolver
): THREE.Group => {
  const palette = getPalette(ctx.worldType);
  const group = new THREE.Group();
  // El terreno queda fijo a la grilla; solo la decoración rota con el usuario.
  addFixedTerrainTile(group, x, z, palette.treeTerrain, ctx, rotation?.[1] ?? 0);
  const recipe = resolve(ctx.worldType, variant, palette);
  if (recipe) addBoxes(group, [x, getTileTopY(), z], recipe);
  return group;
};
