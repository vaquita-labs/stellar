import { useEffect } from 'react';
import { create } from 'zustand';

type ResizeState = {
  loading: { [key: string]: boolean };
  setLoading: (key: string, isLoading: boolean) => void;
};

export const useLoader = create<ResizeState>((set, get) => ({
  loading: {},
  setLoading: (key, isLoading) => set({ loading: { ...get().loading, [key]: isLoading } }),
}));

export const useLoading = (key: string, isLoading: boolean) => {
  const setLoading = useLoader((store) => store.setLoading);
  useEffect(() => {
    setLoading(key, isLoading);
  }, [isLoading, key, setLoading]);
};
