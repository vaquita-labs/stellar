import type { AdapterId, WalletAdapter } from './types';

const ADAPTER_STORAGE_KEY = 'wallet:adapter';

let active: WalletAdapter | null = null;
const listeners = new Set<(a: WalletAdapter | null) => void>();

export function setActiveAdapter(adapter: WalletAdapter | null) {
  active = adapter;
  if (typeof window !== 'undefined') {
    if (adapter) {
      window.localStorage.setItem(ADAPTER_STORAGE_KEY, adapter.id);
    } else {
      window.localStorage.removeItem(ADAPTER_STORAGE_KEY);
    }
  }
  listeners.forEach((listener) => listener(adapter));
}

export function getActiveAdapter(): WalletAdapter | null {
  return active;
}

export function requireActiveAdapter(): WalletAdapter {
  if (!active) {
    throw new Error('No active wallet adapter. Connect a wallet first.');
  }
  return active;
}

export function getStoredAdapterId(): AdapterId | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ADAPTER_STORAGE_KEY);
  if (raw === 'stellar-wallets-kit' || raw === 'pollar') return raw;
  return null;
}

export function onActiveAdapterChange(listener: (a: WalletAdapter | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}