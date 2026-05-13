import { Client as ContractClient } from '@stellar/stellar-sdk/contract';
import { requireActiveAdapter } from './wallet/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSignedXdr(res: any): string {
  if (typeof res === 'string') return res;
  const out = res?.signedTxXdr ?? res?.signedXDR ?? res?.signedXdr ?? res?.xdr;
  if (typeof out !== 'string') throw new Error('Wallet did not return a base64 XDR string');
  return out;
}

const clientRef: { current: ContractClient | null } = { current: null };
let cachedKey = '';

export async function getSorobanClient(address: string, contractId: string, rpcUrl: string, networkPassphrase: string) {
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
    const adapter = requireActiveAdapter();
    const signed = await adapter.signTransaction(xdr, { address, networkPassphrase });
    return normalizeSignedXdr(signed);
  };

  const client = await ContractClient.from({
    contractId,
    rpcUrl,
    networkPassphrase,
    publicKey: address,
    // @ts-expect-error stellar-sdk's signTransaction type is overly narrow
    signTransaction,
  });

  clientRef.current = client;
  cachedKey = cacheKey;

  return clientRef;
}
