import { BoxSpec } from '../../kit';

/** Cactus chico con dos brazos. */
export const cactus = (color: string): BoxSpec[] => [
  { size: [0.2, 1, 0.2], at: [0, 0, 0], color },
  { size: [0.1, 0.5, 0.1], at: [0.2, 0.2, 0], color },
  { size: [0.1, 0.4, 0.1], at: [-0.2, 0.15, 0], color },
  { size: [0.4, 0.1, 0.1], at: [0, 0, 0], color },
];
