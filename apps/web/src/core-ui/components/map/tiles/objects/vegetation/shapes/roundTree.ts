import { BoxSpec, LEAF_OUTLINE, TOON, toonTrunk } from '../../kit';

/** Árbol redondo: como el clásico pero más alto y de copa angosta. */
export const roundTree = (trunk: string, leaf: string): BoxSpec[] => [
  ...toonTrunk(trunk, 0.62),
  { ...TOON, size: [0.6, 0.58, 0.6], at: [0, 0.3, 0], color: leaf, bevel: 0.09, outline: LEAF_OUTLINE },
];
