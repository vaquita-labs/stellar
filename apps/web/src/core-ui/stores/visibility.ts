import { useEffect } from 'react';

import { create } from 'zustand';

type VisibilityState = {
  isVisible: boolean;
  setIsVisible: (isVisible: boolean) => void;
};

// The map's render loop reads this flag, so it starts from the document's real
// state: seeding it `false` would leave the scene frozen until the first tab
// switch. There is no document on the server, where the page counts as visible.
const isDocumentVisible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible';

export const useVisibilityStore = create<VisibilityState>((set) => ({
  isVisible: isDocumentVisible(),
  setIsVisible: (isVisible: boolean) => set({ isVisible }),
}));

/** Tab visibility, as a selector for components that pause work in the background. */
export const useIsTabVisible = (): boolean => useVisibilityStore((store) => store.isVisible);

export const useVisibility = () => {
  const setIsVisible = useVisibilityStore((store) => store.setIsVisible);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    // The store is seeded at module scope, which may run well before mount:
    // reading again here makes the tab's state at mount time the one that wins.
    handleVisibilityChange();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setIsVisible]);
};
