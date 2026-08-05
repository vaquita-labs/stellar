import { BuildContext } from '@/core-ui/components/map/types';
import { MapObject } from '@/core-ui/types';
import { buildRecipeObject } from '../recipeObject';
import { getDecorationRecipe } from './catalog';

export { getDecorationRecipe } from './catalog';

// Builder del tipo DECORATION (categoría Decoración).
export const getDecorationGroup = (o: MapObject, ctx: BuildContext) => buildRecipeObject(o, ctx, getDecorationRecipe);
