import { Client as ContractClient } from '@stellar/stellar-sdk/contract';
import { getStellarWalletsKit } from './kit';

/** Normaliza las distintas respuestas de signTransaction de las wallets */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSignedXdr(res: any): string {
  if (typeof res === 'string') return res;
  const out = res?.signedTxXdr ?? res?.signedXDR ?? res?.signedXdr ?? res?.xdr;
  if (typeof out !== 'string') throw new Error('Wallet did not return a base64 XDR string');
  return out;
}

/**
 * Keeps a ContractClient instance bound to the current user (address) and wallet signer.
 * Returns a ref whose `.current` is either `ContractClient` or `null` while loading.
 */

const clientRef: { current: ContractClient | null } = { current: null };
let cachedKey = '';

export async function getSorobanClient(address: string, contractId: string, rpcUrl: string, networkPassphrase: string) {
  const kit = getStellarWalletsKit();

  if (!address) {
    clientRef.current = null;
    cachedKey = '';
    return clientRef;
  }

  const cacheKey = `${address}:${contractId}:${rpcUrl}:${networkPassphrase}`;
  if (clientRef.current && cachedKey === cacheKey) {
    return clientRef;
  }

  const signTransaction = async (xdr: string) => {
    const res = await kit.signTransaction(xdr, {
      address,
      networkPassphrase,
    });
    return normalizeSignedXdr(res);
  };

  const client = await ContractClient.from({
    contractId,
    rpcUrl,
    networkPassphrase,
    publicKey: address,
    // @ts-expect-error TODO: signTransaction
    signTransaction,
    // If your wallet supports SEP-43 auth-entry signing, you can also pass:
    // signAuthEntry: async (authXdr: string) => { ... }
  });

  clientRef.current = client;
  cachedKey = cacheKey;

  return clientRef;
}
