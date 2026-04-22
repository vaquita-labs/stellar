import { useEffect } from 'react';
import { useResizeDetector } from 'react-resize-detector';
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

export const useResize = () => {
  const { width = 0, height = 0, ref } = useResizeDetector();
  const setResize = useResizeStore((store) => store.setResize);
  useEffect(() => {
    setResize(width, height);
  }, [width, height, setResize]);
  
  return { ref };
};
