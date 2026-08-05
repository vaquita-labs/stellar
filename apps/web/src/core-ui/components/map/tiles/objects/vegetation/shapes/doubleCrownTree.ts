import { BoxSpec, LEAF_OUTLINE, TOON, toonTrunk } from '../../kit';

/**
 * Árbol de copa doble (asimétrico). La copa chica NO se entierra en la grande:
 * cuelga justo debajo de su borde con un hueco menor que el grosor del hull,
 * que lo llena de negro y dibuja la línea de unión entre copas (mismo truco
 * que TRUNK_LIFT — enterradas no hay silueta).
 */
export const doubleCrownTree = (trunk: string, leaf: string): BoxSpec[] => [
  ...toonTrunk(trunk, 0.62),
  // copa principal un poco más chica que la de roundTree y arrancando más
  // arriba (y=0.08), para que la secundaria — pegada bajo su borde — quede
  // alta sin agrandar el árbol.
  { ...TOON, size: [0.56, 0.48, 0.56], at: [0, 0.32, 0], color: leaf, bevel: 0.09, outline: LEAF_OUTLINE },
  // copa secundaria colgando bajo la esquina de la principal, con tope en
  // y=0.054: hueco de 0.026 < su outline (0.03, más grueso que LEAF_OUTLINE
  // para que el hull siga llenando la ranura de negro con el arbusto un poco
  // más abajo — pegado a la copa los dos contornos se pellizcaban). La línea
  // de unión es el propio contorno del arbusto cerrándose en la ranura, no
  // una pieza aparte. Clave: su meseta superior plana (footprint − bevel)
  // queda TODA bajo la copa (|0.13|+0.13 ≤ 0.28); si asoma, se ve una franja
  // verde iluminada entre la copa y la línea. Solo sobresalen los hombros
  // curvos, cuyo hull sí dibuja silueta.
  { ...TOON, size: [0.42, 0.3, 0.42], at: [0.13, -0.096, 0.13], color: leaf, bevel: 0.08, outline: 0.03 },
];
