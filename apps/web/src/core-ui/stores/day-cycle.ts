import { create } from 'zustand';

export type DayPhase = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'night';

type DayCycleState = {
  dayProgress: number;
  setDayProgress: (progress: number) => void;
};

export const useDayCycleStore = create<DayCycleState>((set) => ({
  // Se inicializa a mediodía para un primer render neutro (evita mismatch de
  // hidratación SSR); el primer frame lo sincroniza con el reloj de juego
  // (ver getGameDayProgress en stores/gameClock, que alimenta DayCycleSky).
  dayProgress: 0.5,
  setDayProgress: (progress) => set({ dayProgress: ((progress % 1) + 1) % 1 }),
}));

// Umbrales alineados con los keyframes estándar del cielo (amanecer ~06:00 =
// 0.25, atardecer ~18:00 = 0.75).
export const getDayPhase = (progress: number): DayPhase => {
  if (progress < 0.25) return progress < 0.2 ? 'night' : 'dawn';
  if (progress < 0.45) return 'morning';
  if (progress < 0.55) return 'midday';
  if (progress < 0.75) return 'afternoon';
  if (progress < 0.8) return 'dusk';
  return 'night';
};

export const isNightTime = (progress: number) => progress >= 0.8 || progress < 0.2;
