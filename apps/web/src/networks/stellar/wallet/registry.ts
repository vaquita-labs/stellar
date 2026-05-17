import type { AdapterId, WalletAdapter } from './types';

const ADAPTER_STORAGE_KEY = 'wallet:adapter';

let active: WalletAdapter | null = null;

export function setActiveAdapter(adapter: WalletAdapter | null) {
  active = adapter;
  if (typeof window !== 'undefined') {
    if (adapter) {
      window.localStorage.setItem(ADAPTER_STORAGE_KEY, adapter.id);
    } else {
      window.localStorage.removeItem(ADAPTER_STORAGE_KEY);
    }
  }
}

export function getActiveAdapter(): WalletAdapter | null {
  return active;
}

export function getStoredAdapterId(): AdapterId | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADAPTER_STORAGE_KEY) === 'pollar' ? 'pollar' : null;
}
