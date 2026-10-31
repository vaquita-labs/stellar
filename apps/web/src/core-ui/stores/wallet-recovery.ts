import { create } from 'zustand';

/**
 * Whether Vaquita's wallet-recovery screen (`WalletRecoveryModal`) is open.
 *
 * It replaces the SDK's recovery modal (`modals.recovery: false` on
 * `PollarProvider`), so the places that used to call `openRecoveryModal()` on
 * the Pollar context call `openWalletRecovery()` here instead: the custody
 * migration once a wallet moved, and the host that listens for a device that
 * is not part of the wallet. A store, not context, so a caller outside the
 * host's subtree (or outside React) can open it.
 */
type WalletRecoveryState = {
  open: boolean;
  openWalletRecovery: () => void;
  closeWalletRecovery: () => void;
};

export const useWalletRecoveryStore = create<WalletRecoveryState>((set) => ({
  open: false,
  openWalletRecovery: () => set({ open: true }),
  closeWalletRecovery: () => set({ open: false }),
}));

export const openWalletRecovery = () => useWalletRecoveryStore.getState().openWalletRecovery();
