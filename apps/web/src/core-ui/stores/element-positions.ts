import { create } from 'zustand';

type CB = () => { x: number; y: number } | null | undefined;

interface ElementPositionsStore {
  setPositions: (key: string, cb: CB) => void;
  getPositions: Record<string, CB>;
}

export const GOLD_COIN = 'gold-coin';

export const useElementPositionsStore = create<ElementPositionsStore>((set) => ({
  setPositions: (key, cb) =>
    set((state) => ({
      getPositions: { ...state.getPositions, [key]: cb },
    })),
  getPositions: {},
}));
