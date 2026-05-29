import { useEffect } from 'react';

import { create } from 'zustand';

type VisibilityState = {
  isVisible: boolean;
  setIsVisible: (isVisible: boolean) => void;
};

export const useVisibilityStore = create<VisibilityState>((set) => ({
  isVisible: false,
  setIsVisible: (isVisible: boolean) => set({ isVisible }),
}));

export const useVisibility = () => {
  const setIsVisible = useVisibilityStore((store) => store.setIsVisible);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setIsVisible(false);
      } else if (document.visibilityState === 'visible') {
        setIsVisible(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
};
