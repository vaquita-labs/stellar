import { create } from 'zustand';

type Tile = [number, number];

type Claim = { current: Tile; target: Tile };

type VaquitaPositionsStore = {
  claims: Record<string, Claim>;
  setClaim: (id: string, current: Tile, target: Tile) => void;
  removeClaim: (id: string) => void;
  isTileOccupied: (x: number, z: number, exceptId?: string) => boolean;
};

const sameTile = (a: Tile, b: Tile) => a[0] === b[0] && a[1] === b[1];

export const useVaquitaPositionsStore = create<VaquitaPositionsStore>((set, get) => ({
  claims: {},
  setClaim: (id, current, target) =>
    set((state) => {
      const existing = state.claims[id];
      if (existing && sameTile(existing.current, current) && sameTile(existing.target, target)) {
        return state;
      }
      return { claims: { ...state.claims, [id]: { current, target } } };
    }),
  removeClaim: (id) =>
    set((state) => {
      if (!(id in state.claims)) return state;
      const next = { ...state.claims };
      delete next[id];
      return { claims: next };
    }),
  isTileOccupied: (x, z, exceptId) => {
    const claims = get().claims;
    for (const id in claims) {
      if (id === exceptId) continue;
      const c = claims[id];
      if (c.current[0] === x && c.current[1] === z) return true;
      if (c.target[0] === x && c.target[1] === z) return true;
    }
    return false;
  },
}));
