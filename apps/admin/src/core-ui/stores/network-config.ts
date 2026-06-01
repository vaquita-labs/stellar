import { logoutAll } from '@/helpers';
import { create } from 'zustand';
import { NetworkResponseDTO } from '../types';

type NetworkConfigStore = {
  types: string[];
  walletAddress: string;
  network: NetworkResponseDTO | null;
  token: NetworkResponseDTO['tokens'][number] | null;
  lockPeriod: number;
  // functions:
  setLockPeriod: (lockPeriod: number) => void;
  setWalletAddress: (walletAddress: string) => void;
  setNetwork: (network: NetworkResponseDTO | null) => void;
  setToken: (token: NetworkResponseDTO['tokens'][number] | null) => void;
  setTypes: (type: string[]) => void;
  reset: (hard?: boolean) => void;
  switchChain: ((chainId: number) => void) | null;
  setSwitchChain: (switchChain: ((chainId: number) => void) | null) => void;
};

const resetObj = {
  types: [],
  walletAddress: '',
  network: null,
  token: null,
  lockPeriod: 0,
};

export const useNetworkConfigStore = create<NetworkConfigStore>()(
  // persist(
  (set, get) => ({
    ...resetObj,
    reset: (hard?: boolean) => {
      console.info('reset', { hard });
      const state = get();
      if (state.types.length > 1 || hard) {
        return set((state) => ({ ...state, ...resetObj }));
      }
      return set((state) => ({ ...state, ...resetObj, walletAddress: state.walletAddress }));
    },
    setWalletAddress: (walletAddress) => {
      set({ walletAddress });
    },
    setTypes: (types) => {
      if (JSON.stringify(get().types) !== JSON.stringify(types)) {
        set({ types });
      }
    },
    setLockPeriod: (lockPeriod: number) => set({ lockPeriod }),
    setToken: (token) => {
      const { token: currentToken, lockPeriod: currentLockPeriod } = get();
      const changed = JSON.stringify(token) !== JSON.stringify(currentToken);
      console.info('setToken', { token, currentToken, changed });
      if (changed) {
        let lockPeriod = currentLockPeriod;
        if (!token?.lockPeriod?.includes(lockPeriod)) {
          lockPeriod = token?.lockPeriod?.[0] ?? 0;
        }
        set({ token, lockPeriod });
      }
    },
    setNetwork: async (network) => {
      const { walletAddress, network: currentNetwork, switchChain } = get();
      const changed = JSON.stringify(network) !== JSON.stringify(currentNetwork);
      console.info('setNetwork', { network, currentNetwork, changed });
      if (changed) {
        const token = network?.tokens?.[0] || null;
        let newWalletAddress = walletAddress;
        if (currentNetwork && currentNetwork?.type !== network?.type) {
          await logoutAll();
          newWalletAddress = '';
        }
        set({ network, token, walletAddress: newWalletAddress });
      }
      if (typeof network?.chainId === 'number' && switchChain) {
        switchChain(network?.chainId);
      }
    },
    switchChain: null,
    setSwitchChain: (switchChain) => set({ switchChain }),
  })
  // {
  //   version: 3,
  //   name: 'user-store',
  //   storage: createJSONStorage(() => localStorage),
  //   merge: (persistedState, currentState) => {
  //     if ((persistedState as NetworkConfigStore)?.network?.name === 'Stellar Testnet') {
  //       return { ...currentState, ...(persistedState || {}), walletAddress: '' };
  //     }
  //     return { ...currentState, ...(persistedState || {}) };
  //   },
  // }
  // )
);
