import { ConnectedWallet } from '@privy-io/react-auth';
import { create } from 'zustand';

type PrivyStore = {
  ready: boolean;
  authenticated: boolean;
  wallets: ConnectedWallet[];
  setPrivyData: (data: Partial<PrivyStore>) => void;
  logout: () => Promise<void>;
};

export const usePrivyStore = create<PrivyStore>((set) => ({
  ready: false,
  authenticated: false,
  wallets: [],
  logout: async () => {},
  setPrivyData: (data) => set((state) => ({ ...state, ...data })),
}));
