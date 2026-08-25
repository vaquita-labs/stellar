import type {
  ConnectWalletResponse,
  SignTransactionOptions,
  SignTransactionResponse,
  WalletAdapter,
  WalletAdapterMeta,
} from '@pollar/core';
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

/**
 * Pollar `WalletAdapter` backed by a raw Stellar keypair.
 *
 * Pollar treats an external wallet as a black box that can `connect()` and
 * `signTransaction()`; everything else (the SEP-10 wallet login, `/tx/build`,
 * `/tx/submit`, status polling, session refresh) is the real SDK talking to the
 * real Pollar backend. This adapter is that black box with no UI: it answers
 * `connect()` with the keypair's public key and signs whatever XDR the SDK hands
 * it — the Pollar login challenge, the Vaquita API session challenge and every
 * Soroban transaction the app builds.
 *
 * Only reachable through the `E2E_TEST_SIGNER=1` module alias (see
 * `next.config.ts`); nothing in `src/` imports it.
 */

/** `login({ provider })` id and the wallet-type label Pollar records for the session. */
export const E2E_ADAPTER_ID = 'e2e-local-key';

/** Global the Playwright fixture sets through `addInitScript` before the app boots. */
export const E2E_SECRET_GLOBAL = '__E2E_STELLAR_SECRET__';

/** localStorage fallback so a manual browser session can also use the signer. */
export const E2E_SECRET_STORAGE_KEY = 'e2e:stellar-secret';

declare global {
  interface Window {
    [E2E_SECRET_GLOBAL]?: string;
  }
}

export function readE2ESecret(): string | null {
  if (typeof window === 'undefined') return null;
  const fromGlobal = window[E2E_SECRET_GLOBAL];
  if (typeof fromGlobal === 'string' && fromGlobal.startsWith('S')) return fromGlobal;
  try {
    const stored = window.localStorage.getItem(E2E_SECRET_STORAGE_KEY);
    if (stored && stored.startsWith('S')) return stored;
  } catch {
    // Storage can throw in sandboxed contexts; the signer is then simply absent.
  }
  return null;
}

function passphraseFor(options?: SignTransactionOptions): string {
  if (options?.networkPassphrase) return options.networkPassphrase;
  if (options?.network === 'mainnet' || options?.network === Networks.PUBLIC) return Networks.PUBLIC;
  return Networks.TESTNET;
}

export class LocalKeyAdapter implements WalletAdapter {
  readonly type = E2E_ADAPTER_ID;
  readonly meta: WalletAdapterMeta = { label: 'Local key (e2e)' };
  readonly custody = 'external' as const;

  private keypair: Keypair | null = null;

  private resolveKeypair(): Keypair | null {
    if (this.keypair) return this.keypair;
    const secret = readE2ESecret();
    if (!secret) return null;
    this.keypair = Keypair.fromSecret(secret);
    return this.keypair;
  }

  async isAvailable(): Promise<boolean> {
    return this.resolveKeypair() !== null;
  }

  async connect(): Promise<ConnectWalletResponse> {
    const keypair = this.resolveKeypair();
    if (!keypair) throw new Error(`[e2e-signer] no secret: set window.${E2E_SECRET_GLOBAL} before the app boots`);
    return { address: keypair.publicKey() };
  }

  async disconnect(): Promise<void> {
    this.keypair = null;
  }

  async getPublicKey(): Promise<string | null> {
    return this.resolveKeypair()?.publicKey() ?? null;
  }

  async signTransaction(xdr: string, options?: SignTransactionOptions): Promise<SignTransactionResponse> {
    const keypair = this.resolveKeypair();
    if (!keypair) throw new Error('[e2e-signer] no secret available to sign with');
    const tx = TransactionBuilder.fromXDR(xdr, passphraseFor(options));
    tx.sign(keypair);
    return { signedTxXdr: tx.toXDR() };
  }
}
