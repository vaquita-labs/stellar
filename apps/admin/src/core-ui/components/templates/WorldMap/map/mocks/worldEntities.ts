export type TerrainEntity = {
  id: string;
  position: [number, number, number];
  beingWorked: boolean;
  variant: number;
};

export const mockTrees: TerrainEntity[] = [
  { id: 'tree-1', position: [2, 0, 2], beingWorked: false, variant: 0 },
  { id: 'tree-2', position: [3, 0, 2], beingWorked: false, variant: 1 },
  { id: 'tree-3', position: [4, 0, 8], beingWorked: true, variant: 2 },
  { id: 'tree-4', position: [4, 0, 9], beingWorked: true, variant: 1 },
  { id: 'tree-5', position: [10, 0, 1], beingWorked: true, variant: 2 },
  { id: 'tree-6', position: [10, 0, 2], beingWorked: true, variant: 1 },
  { id: 'tree-7', position: [11, 0, 11], beingWorked: true, variant: 0 },
  { id: 'tree-9', position: [11, 0, 10], beingWorked: true, variant: 1 },
  { id: 'tree-10', position: [1, 0, 11], beingWorked: false, variant: 0 },
  { id: 'tree-11', position: [2, 0, 11], beingWorked: false, variant: 1 },
  { id: 'tree-12', position: [0, 0, 10], beingWorked: false, variant: 2 },
  { id: 'tree-13', position: [0, 0, 11], beingWorked: false, variant: 2 },
];

export const mockRocks: TerrainEntity[] = [
  { id: 'rock-1', position: [3, 0, 9], beingWorked: true, variant: 0 },
  { id: 'rock-2', position: [3, 0, 8], beingWorked: false, variant: 1 },
  { id: 'rock-3', position: [2, 0, 9], beingWorked: false, variant: 2 },

  { id: 'rock-4', position: [10, 0, 0], beingWorked: false, variant: 0 },
  { id: 'rock-5', position: [11, 0, 1], beingWorked: false, variant: 1 },
  { id: 'rock-6', position: [11, 0, 0], beingWorked: false, variant: 2 },

  { id: 'rock-7', position: [1, 0, 1], beingWorked: false, variant: 0 },
  { id: 'rock-8', position: [1, 0, 2], beingWorked: false, variant: 1 },
  { id: 'rock-9', position: [3, 0, 1], beingWorked: false, variant: 0 },
  { id: 'rock-10', position: [2, 0, 1], beingWorked: false, variant: 2 },
];

export const mockWater = [
  { id: 'water-1', position: [1, 0, 5] },
  { id: 'water-2', position: [2, 0, 5] },
  { id: 'water-3', position: [3, 0, 5] },
  { id: 'water-4', position: [3, 0, 4] },
  { id: 'water-5', position: [3, 0, 6] },

  { id: 'water-6', position: [10, 0, 10] },
  { id: 'water-7', position: [10, 0, 11] },
  { id: 'water-8', position: [9, 0, 11] },
  { id: 'water-9', position: [9, 0, 9] },
  { id: 'water-10', position: [8, 0, 9] },
  { id: 'water-11', position: [10, 0, 9] },
];

export const mockGoal = [
  { id: 'goal-1', position: [5, 0, 5] },
  { id: 'goal-2', position: [5, 0, 6] },
  { id: 'goal-3', position: [6, 0, 5] },
  { id: 'goal-4', position: [6, 0, 6] },
];
