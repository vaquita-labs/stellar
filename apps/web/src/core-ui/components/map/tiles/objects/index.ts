// Barrel de builders de objetos del mapa, agrupados por categoría (ver
// categories.ts). registry.ts levanta los builders desde acá.

// Edificios (geometría; los componentes viven en ../buildings/).
export * from './bank';
export * from './barn';
export * from './windmill';
export * from './well';
export * from './lamp';
export * from './leaderboard';

// Categorías de objetos-receta (una carpeta cada una).
export * from './terrain'; // GRASS, WATER, ROAD, ROCK
export * from './vegetation'; // TREE, BUSH
export * from './seasonal'; // SEASONAL (calabaza y temáticos)
export * from './decoration'; // DECORATION
export * from './collectibles'; // COLLECTIBLE

// Taxonomía (categorías) para agrupar en la tienda / organizar.
export * from './categories';
