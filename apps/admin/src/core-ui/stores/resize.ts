import { create } from 'zustand';

type ResizeState = {
  width: number;
  height: number;
  setResize: (width: number, height: number) => void;
};

export const useResizeStore = create<ResizeState>((set) => ({
  width: 0,
  height: 0,
  setResize: (width, height) => set({ width, height }),
}));
