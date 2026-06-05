import { create } from 'zustand';
import { NetworkResponseDTO } from '../types';

type ConfigStore = {
  walletAddress: string;
  network: NetworkResponseDTO | null;
  token: NetworkResponseDTO['tokens'][number] | null;
  lockPeriod: number;
  // functions:
  setLockPeriod: (lockPeriod: number) => void;
  setWalletAddress: (walletAddress: string) => void;
  setNetwork: (network: NetworkResponseDTO | null) => void;
  setToken: (token: NetworkResponseDTO['tokens'][number] | null) => void;
  reset: (hard?: boolean) => void;
};

const resetObj = {
  walletAddress: '',
  network: null,
  token: null,
  lockPeriod: 0,
};

export const useConfigStore = create<ConfigStore>()((set, get) => ({
  ...resetObj,
  reset: (hard?: boolean) => {
    console.info('reset', { hard });
    if (hard) {
      return set((state) => ({ ...state, ...resetObj }));
    }
    // Single-network: preserve the wallet address on a soft reset.
    return set((state) => ({ ...state, ...resetObj, walletAddress: state.walletAddress }));
  },
  setWalletAddress: (walletAddress) => {
    set({ walletAddress });
  },
  setLockPeriod: (lockPeriod: number) => set({ lockPeriod }),
  setToken: (token) => {
    const { token: currentToken, lockPeriod: currentLockPeriod } = get();
    const changed = JSON.stringify(token) !== JSON.stringify(currentToken);
    console.info('setToken', { token, currentToken, changed });
    if (changed) {
      let lockPeriod = currentLockPeriod;
      if (!token?.lockPeriods?.includes(lockPeriod)) {
        lockPeriod = token?.lockPeriods?.[0] ?? 0;
      }
      set({ token, lockPeriod });
    }
  },
  setNetwork: (network) => {
    const { network: currentNetwork } = get();
    const changed = JSON.stringify(network) !== JSON.stringify(currentNetwork);
    console.info('setNetwork', { network, currentNetwork, changed });
    if (changed) {
      const token = network?.tokens?.[0] || null;
      const lockPeriod = token?.lockPeriods?.[0] ?? 0;
      set({ network, token, lockPeriod });
    }
  },
}));
