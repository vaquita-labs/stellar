import type { PollarClient } from '@pollar/core';
import type { WalletAdapter } from '../types';

type PollarBinding = {
  client: PollarClient;
  walletAddress: string;
  logout: () => void;
};

let binding: PollarBinding | null = null;

export function setPollarBinding(next: PollarBinding | null) {
  binding = next;
}

export function getPollarBinding(): PollarBinding | null {
  return binding;
}

export const pollarAdapter: WalletAdapter = {
  id: 'pollar',

  getAddress() {
    return binding?.walletAddress || null;
  },

  async connect() {
    // Connect is driven by Pollar's hosted login modal; the bridge calls back into
    // the registry with the wallet address once the user finishes the flow.
    throw new Error('Pollar.connect() must be triggered via the Pollar login modal, not directly.');
  },

  async disconnect() {
    if (!binding) return;
    try {
      binding.client.logout();
    } catch (e) {
      console.warn('[pollar-adapter] client.logout failed:', e);
    }
    // Belt and suspenders: Pollar's _clearSession() should remove these, but if the
    // call ever no-ops (e.g. ran during a re-render where the closure was stale)
    // we still want a clean slate so the next openLoginModal() does not see an
    // "authenticated" state and auto-close itself.
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('pollar:session');
      window.localStorage.removeItem('pollar:walletType');
    }
    binding = null;
  },

  async hydrate() {
    return binding?.walletAddress || null;
  },
};
