'use client';

import { create } from 'zustand';

export type UserInfo = {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
};

type State = {
  ready: boolean;
  authenticated: boolean;
  logout: () => Promise<void>;

  // Legacy (mantener por compatibilidad temporal)
  isConnected: boolean;
  userInfo: UserInfo | null;
  address: string;
  disconnect: () => Promise<void>;
};

type Actions = {
  setPrivyData: (data: Partial<Omit<State, 'isConnected' | 'disconnect'>>) => void;
  clear: () => void;
};

const noop = async () => {};

export const useAuthStore = create<State & Actions>()((set, get) => ({
  ready: false,
  authenticated: false,
  wallets: [],
  logout: noop,

  // Legacy
  isConnected: false,
  userInfo: null,
  address: '',
  disconnect: noop,

  setPrivyData: ({ ready, authenticated, logout, userInfo, address }) =>
    set((state) => {
      const nextAuthenticated = authenticated ?? state.authenticated;
      return {
        ready: ready ?? state.ready,
        authenticated: nextAuthenticated,
        logout: logout ?? state.logout,
        isConnected: nextAuthenticated,
        userInfo: userInfo ?? state.userInfo,
        address: address ?? state.address,
        disconnect: logout ?? state.logout,
      };
    }),

  clear: () =>
    set({
      ready: false,
      authenticated: false,
      logout: noop,
      isConnected: false,
      userInfo: null,
      address: '',
      disconnect: noop,
    }),
}));

export const usePrivyStore = useAuthStore;
