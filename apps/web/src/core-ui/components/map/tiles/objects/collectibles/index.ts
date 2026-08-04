import { BuildContext } from '@/core-ui/components/map/types';
import { MapObject } from '@/core-ui/types';
import { buildRecipeObject } from '../recipeObject';
import { getCollectibleRecipe } from './catalog';

export { getCollectibleRecipe } from './catalog';

// Builder del tipo COLLECTIBLE (categoría Coleccionables y recompensas).
export const getCollectibleGroup = (o: MapObject, ctx: BuildContext) => buildRecipeObject(o, ctx, getCollectibleRecipe);
