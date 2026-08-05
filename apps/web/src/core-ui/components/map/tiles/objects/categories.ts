import { MapObjectType } from '@/core-ui/types';

// ---------------------------------------------------------------------------
// Taxonomía de objetos del mapa. Las CATEGORÍAS son la agrupación de alto nivel
// (para organizar el código y agrupar la tienda); el par `type` + `variant`
// sigue siendo el contrato con la DB. Un `type` cae en UNA categoría.
//
// Estructura del código, una carpeta por categoría de objetos-receta:
//   objects/terrain/      → GRASS, WATER, ROAD, ROCK, EMPTY
//   objects/vegetation/   → TREE, BUSH
//   objects/seasonal/     → (SEASONAL) calabaza y temáticos
//   objects/decoration/   → (DECORATION) props no funcionales
//   objects/collectibles/ → (COLLECTIBLE) recompensas colocables
//   objects/{bank,barn,leaderboard}.ts + ../buildings/ → edificios (evolucionarán)
// ---------------------------------------------------------------------------

export enum MapObjectCategory {
  TERRAIN = 'terrain', // terreno y base
  VEGETATION = 'vegetation',
  BUILDING = 'building',
  DECORATION = 'decoration',
  COLLECTIBLE = 'collectible',
  SEASONAL = 'seasonal', // temáticos / estacionales
}

export const CATEGORY_OF: Record<MapObjectType, MapObjectCategory> = {
  [MapObjectType.GRASS]: MapObjectCategory.TERRAIN,
  [MapObjectType.WATER]: MapObjectCategory.TERRAIN,
  [MapObjectType.ROAD]: MapObjectCategory.TERRAIN,
  [MapObjectType.ROCK]: MapObjectCategory.TERRAIN,
  [MapObjectType.EMPTY]: MapObjectCategory.TERRAIN,
  [MapObjectType.TREE]: MapObjectCategory.VEGETATION,
  [MapObjectType.BUSH]: MapObjectCategory.VEGETATION,
  [MapObjectType.BANK]: MapObjectCategory.BUILDING,
  [MapObjectType.BARN]: MapObjectCategory.BUILDING,
  [MapObjectType.WINDMILL]: MapObjectCategory.BUILDING,
  [MapObjectType.WELL]: MapObjectCategory.BUILDING,
  // El farol es DECORACIÓN, pero se renderiza por el mecanismo de "building"
  // (registry.tsx BUILDINGS) porque necesita un componente React (Extras) para
  // encenderse de noche.
  [MapObjectType.LAMP]: MapObjectCategory.DECORATION,
  [MapObjectType.LEADERBOARD]: MapObjectCategory.BUILDING,
  // Monumento conmemorativo: se renderiza por el mecanismo de "building".
  [MapObjectType.SUMMIT]: MapObjectCategory.BUILDING,
  // CLOCK es un desbloqueo de HUD (no se coloca): lo dejamos bajo BUILDING por
  // ser una compra funcional, hasta que exista una categoría de HUD si hace falta.
  [MapObjectType.CLOCK]: MapObjectCategory.BUILDING,
  [MapObjectType.DECORATION]: MapObjectCategory.DECORATION,
  [MapObjectType.SEASONAL]: MapObjectCategory.SEASONAL,
  [MapObjectType.COLLECTIBLE]: MapObjectCategory.COLLECTIBLE,
};

/** Categoría de un tipo de objeto del mapa. */
export const categoryOf = (type: MapObjectType): MapObjectCategory => CATEGORY_OF[type];

// NOTA (deuda intencional): la calabaza es conceptualmente SEASONAL pero HOY se
// sirve como TREE variant (6 bosque / 0 volcán) para no migrar la DB. Su código
// ya vive en objects/seasonal/. El re-type a SEASONAL se hace como paso backend
// coordinado (migrar filas map_objects + instancias colocadas).
