import { BoxSpec, OUTLINE_COLOR } from '@/core-ui/components/map/tiles/recipe';

// ---------------------------------------------------------------------------
// Kit compartido de las formas de árboles/decoración. Estilo toon (cel-shading
// + contorno oscuro + copas biseladas) y helpers reusables. Las formas de
// shapes/* importan de acá; NO eligen colores del mundo (eso lo hace
// catalog.ts): cada forma queda parametrizada por color y es reutilizable.
// ---------------------------------------------------------------------------

// Re-export para que las formas importen todo desde un solo lugar (../kit).
export type { BoxSpec };

const TRUNK_OUTLINE = 0.02;
export const LEAF_OUTLINE = 0.02;
export const LEAF_BEVEL = 0.1;

// El tronco flota apenas sobre el tile: el hull del contorno sobresale por
// debajo y llena ese hueco de negro, dibujando la línea de base contra el
// suelo (el inverted hull no genera silueta donde una caja se hunde en otra).
const TRUNK_LIFT = 0.015;

// receiveShadow apagado: el shadow map de la escena mete acné (moteado) en
// las caras planas del cel-shading; el volumen ya lo dan faceShade + toon.
export const TOON = { material: 'toon', faceShade: true, receiveShadow: false } as const;

/**
 * Tronco de un solo color apoyado sobre el tile. `height` permite alargarlo
 * para que siempre penetre en la copa (si copa y tronco apenas se tocan, el
 * contorno de la copa los hace ver como piezas separadas). El zócalo negro
 * dibuja la línea de base contra el suelo: el hull solo da silueta y desde
 * ángulos bajos esa base se veía como mancha, no como trazo.
 */
export const toonTrunk = (trunk: string, height = 0.5): BoxSpec[] => [
  {
    size: [0.18 + 2 * TRUNK_OUTLINE, 0.04, 0.18 + 2 * TRUNK_OUTLINE],
    at: [0, -0.485, 0],
    color: OUTLINE_COLOR,
    material: 'basic',
    castShadow: false,
    receiveShadow: false,
  },
  { ...TOON, size: [0.18, height, 0.18], at: [0, height / 2 - 0.5 + TRUNK_LIFT, 0], color: trunk, outline: TRUNK_OUTLINE },
];
