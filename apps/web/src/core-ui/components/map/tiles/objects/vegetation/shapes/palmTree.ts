import { BoxSpec, LEAF_OUTLINE, TOON, toonTrunk } from '../../kit';

// Escalones de cada fronda de palmera: se alejan del centro y bajan, para que
// la hoja se lea como un arco que cae (droop voxel) y no como una cruz plana.
const FROND_STEPS: Array<{ dist: number; y: number; long: number; wide: number; thick: number }> = [
  { dist: 0.2, y: 0.5, long: 0.3, wide: 0.2, thick: 0.07 },
  { dist: 0.43, y: 0.455, long: 0.26, wide: 0.17, thick: 0.06 },
  { dist: 0.6, y: 0.41, long: 0.2, wide: 0.14, thick: 0.05 },
];

// Contorno fino para piezas chicas (frondas, cocos): con LEAF_OUTLINE el hull
// engordaba casi tanto como la pieza.
const FROND_OUTLINE = 0.012;

/** Palmera: tronco alto + penacho con frondas que caen en escalones + cocos. */
export const palmTree = (trunk: string, leaf: string, coconut: string): BoxSpec[] => {
  const fronds: BoxSpec[] = [];
  for (const [ux, uz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    for (const s of FROND_STEPS) {
      fronds.push({
        ...TOON,
        size: ux !== 0 ? [s.long, s.thick, s.wide] : [s.wide, s.thick, s.long],
        at: [ux * s.dist, s.y, uz * s.dist],
        color: leaf,
        bevel: 0.02,
        outline: FROND_OUTLINE,
      });
    }
  }
  return [
    ...toonTrunk(trunk, 0.95),
    // penacho central del que nacen las frondas
    { ...TOON, size: [0.26, 0.14, 0.26], at: [0, 0.52, 0], color: leaf, bevel: 0.05, outline: LEAF_OUTLINE },
    ...fronds,
    // cocos colgando bajo el penacho, hundidos apenas en el tronco
    { ...TOON, size: [0.11, 0.11, 0.11], at: [0.1, 0.4, 0.08], color: coconut, bevel: 0.03, outline: FROND_OUTLINE },
    { ...TOON, size: [0.11, 0.11, 0.11], at: [-0.09, 0.4, -0.07], color: coconut, bevel: 0.03, outline: FROND_OUTLINE },
  ];
};
