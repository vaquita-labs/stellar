import { withTimeout } from '@/core-ui/helpers';
import { getStellarWalletsKit } from '../../kit';
import { normalizeSignedXdr } from '../../xdr';
import type { SignOpts, WalletAdapter } from '../types';

const STORAGE = {
  walletId: 'swk:walletId',
  address: 'swk:address',
};

let cachedAddress: string | null = null;

async function readAddress(timeoutMs: number): Promise<string | null> {
  const res = await withTimeout(getStellarWalletsKit().getAddress(), timeoutMs, 'getAddress');
  const addr = (res as { address?: string })?.address || (typeof res === 'string' ? (res as string) : null);
  return addr && typeof addr === 'string' ? addr : null;
}

export const stellarWalletsKitAdapter: WalletAdapter = {
  id: 'stellar-wallets-kit',
  canSignAuthEntry: true,
  submitsOnSign: false,

  getAddress() {
    if (cachedAddress) return cachedAddress;
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE.address);
  },

  async connect() {
    return new Promise<{ address: string } | null>((resolve, reject) => {
      let settled = false;
      getStellarWalletsKit()
        .openModal({
          onWalletSelected: async (option) => {
            try {
              console.info('[swk-adapter] selected wallet:', option?.id);
              getStellarWalletsKit().setWallet(option.id);
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(STORAGE.walletId, option.id);
              }
              const isAlbedo = String(option?.id || '').toLowerCase().includes('albedo');
              const addr = await readAddress(isAlbedo ? 15000 : 7000);
              if (!addr) throw new Error('Wallet did not return an address');
              cachedAddress = addr;
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(STORAGE.address, addr);
              }
              settled = true;
              resolve({ address: addr });
            } catch (error) {
              settled = true;
              reject(error);
            }
          },
        })
        .catch((error) => {
          if (!settled) reject(error);
        });
    }).catch((error) => {
      console.warn('[swk-adapter] connect failed:', (error as Error)?.message || error);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE.walletId);
      }
      throw error;
    });
  },

  async disconnect() {
    try {
      await getStellarWalletsKit()?.disconnect();
    } catch (e) {
      console.warn('[swk-adapter] disconnect ignore:', e);
    }
    cachedAddress = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE.walletId);
      window.localStorage.removeItem(STORAGE.address);
    }
  },

  async hydrate() {
    if (typeof window === 'undefined') return null;
    const savedWalletId = window.localStorage.getItem(STORAGE.walletId);
    const savedAddress = window.localStorage.getItem(STORAGE.address);
    console.info('[swk-adapter] hydrate', { savedWalletId, savedAddress });
    if (!savedWalletId) {
      if (savedAddress) cachedAddress = savedAddress;
      return savedAddress;
    }
    try {
      getStellarWalletsKit().setWallet(savedWalletId);
      const addr = await readAddress(4000);
      if (addr) {
        cachedAddress = addr;
        window.localStorage.setItem(STORAGE.address, addr);
        return addr;
      }
    } catch (e) {
      console.warn('[swk-adapter] hydrate restore failed, clearing wallet id:', e);
      window.localStorage.removeItem(STORAGE.walletId);
    }
    if (savedAddress) cachedAddress = savedAddress;
    return savedAddress;
  },

  async signTransaction(xdr, { address, networkPassphrase }) {
    const res = await getStellarWalletsKit().signTransaction(xdr, { address, networkPassphrase });
    return normalizeSignedXdr(res);
  },

  async signAuthEntry(authXdr, { address, networkPassphrase }: SignOpts) {
    const kit = getStellarWalletsKit() as unknown as {
      signAuthEntry: (xdr: string, opts: SignOpts) => Promise<unknown>;
    };
    const res = await kit.signAuthEntry(authXdr, { address, networkPassphrase });
    return normalizeSignedXdr(res as Parameters<typeof normalizeSignedXdr>[0], true);
  },
};
