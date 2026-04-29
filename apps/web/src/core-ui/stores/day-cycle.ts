import { create } from 'zustand';

export type DayPhase = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'night';

const DAY_LENGTH_MS = 240_000;

type DayCycleState = {
  dayProgress: number;
  dayLengthMs: number;
  advance: (deltaSeconds: number) => void;
  setDayProgress: (progress: number) => void;
};

export const useDayCycleStore = create<DayCycleState>((set) => ({
  dayProgress: 0.25,
  dayLengthMs: DAY_LENGTH_MS,
  advance: (deltaSeconds) =>
    set((state) => {
      const next = state.dayProgress + (deltaSeconds * 1000) / state.dayLengthMs;
      return { dayProgress: next - Math.floor(next) };
    }),
  setDayProgress: (progress) => set({ dayProgress: ((progress % 1) + 1) % 1 }),
}));

export const getDayPhase = (progress: number): DayPhase => {
  if (progress < 0.05) return 'dawn';
  if (progress < 0.25) return 'morning';
  if (progress < 0.5) return 'midday';
  if (progress < 0.7) return 'afternoon';
  if (progress < 0.8) return 'dusk';
  return 'night';
};

export const isNightTime = (progress: number) => progress >= 0.8 || progress < 0.05;
