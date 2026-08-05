import { BoxSpec } from '../../kit';

/** Tronco seco con ramas quebradas. */
export const deadTree = (color: string): BoxSpec[] => [
  { size: [0.2, 0.8, 0.2], at: [0, -0.65, 0], color },
  { size: [0.4, 0.1, 0.1], at: [0.2, -0.35, 0], color },
  { size: [0.3, 0.1, 0.1], at: [-0.2, -0.5, 0], color },
  { size: [0.15, 0.2, 0.15], at: [0.05, -0.15, 0], color },
];
