import { BoxSpec } from '../../kit';

/** Cactus grande con base en cruz. */
export const bigCactus = (color: string): BoxSpec[] => [
  { size: [0.3, 1, 0.3], at: [0, 0, 0], color },
  { size: [0.1, 0.5, 0.1], at: [0.3, 0.2, 0], color },
  { size: [0.1, 0.2, 0.1], at: [-0.3, -0.1, 0], color },
  { size: [0.7, 0.1, 0.1], at: [0, 0, 0], color },
  { size: [0.4, 0.1, 0.1], at: [0, -0.5, 0], color },
  { size: [0.1, 0.1, 0.4], at: [0, -0.5, 0], color },
];
