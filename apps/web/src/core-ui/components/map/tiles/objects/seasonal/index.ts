import { BuildContext } from '@/core-ui/components/map/types';
import { MapObject } from '@/core-ui/types';
import { buildRecipeObject } from '../recipeObject';
import { getSeasonalRecipe } from './catalog';

export { getSeasonalRecipe } from './catalog';

// Builder del tipo SEASONAL (categoría Temáticos/estacionales).
export const getSeasonalGroup = (o: MapObject, ctx: BuildContext) => buildRecipeObject(o, ctx, getSeasonalRecipe);
