import { BuildContext } from '@/core-ui/components/map/types';
import { MapObject } from '@/core-ui/types';
import { buildRecipeObject } from '../recipeObject';
import { getTreeRecipe } from './catalog';

export { getTreeRecipe } from './catalog';
export { getBushGroup } from './bush';

// Builder del tipo TREE (categoría Vegetación): terreno del tile + receta.
export const getTreeGroup = (o: MapObject, ctx: BuildContext) => buildRecipeObject(o, ctx, getTreeRecipe);
