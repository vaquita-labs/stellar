import type { PollarClient, TransactionState } from '@pollar/core';
import type { SubmitResult, WalletAdapter } from '../types';

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

function requireBinding(): PollarBinding {
  if (!binding) {
    throw new Error(
      'Pollar adapter is not bound yet. Make sure <PollarProvider> + <PollarBridge> are mounted and the user is logged in.',
    );
  }
  return binding;
}

async function awaitTransactionResult(client: PollarClient): Promise<SubmitResult> {
  return new Promise<SubmitResult>((resolve, reject) => {
    const unsubscribe = client.onTransactionStateChange((state: TransactionState) => {
      if (state.step === 'success') {
        unsubscribe();
        resolve({ hash: state.hash });
      } else if (state.step === 'error') {
        unsubscribe();
        reject(new Error(state.details || 'Pollar transaction failed'));
      }
    });
  });
}

export const pollarAdapter: WalletAdapter = {
  id: 'pollar',
  // Probe: we don't actually know yet whether Pollar supports Soroban auth entries.
  // Leaving false so sorobanTx falls back to a clear error message when contracts require it.
  canSignAuthEntry: false,
  submitsOnSign: true,

  getAddress() {
    return binding?.walletAddress || null;
  },

  async connect() {
    // Connect is driven by Pollar's hosted login modal; the bridge calls back into
    // the registry with the wallet address once the user finishes the flow.
    // The button itself triggers openLoginModal() from the React context, not from here.
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

  async signTransaction() {
    throw new Error(
      'Pollar signs and submits atomically. Use the signAndSubmit pipeline (submitsOnSign === true).',
    );
  },

  async signAndSubmitTransaction(xdr: string): Promise<SubmitResult> {
    const { client } = requireBinding();
    const resultPromise = awaitTransactionResult(client);
    try {
      await client.signAndSubmitTx(xdr);
    } catch (err) {
      // signAndSubmitTx may throw synchronously if the state machine rejects the XDR.
      throw new Error(
        `Pollar rejected signAndSubmitTx (likely because the XDR was not built via Pollar.buildTx). Original: ${
          (err as Error)?.message ?? String(err)
        }`,
      );
    }
    return resultPromise;
  },
};
