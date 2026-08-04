import { BoxSpec, LEAF_BEVEL, LEAF_OUTLINE, TOON, toonTrunk } from '../../kit';

/** Árbol clásico: tronco + copa cúbica biselada. */
export const crownTree = (trunk: string, leaf: string): BoxSpec[] => [
  ...toonTrunk(trunk),
  { ...TOON, size: [0.75, 0.65, 0.75], at: [0, 0.18, 0], color: leaf, bevel: LEAF_BEVEL, outline: LEAF_OUTLINE },
];
