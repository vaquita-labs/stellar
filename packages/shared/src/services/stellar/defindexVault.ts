import {
  Account,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { resolveSorobanNetwork, type SorobanCallOptions } from './rpc';

function toBigIntSafe(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === 'string' && v !== '') return BigInt(v);
  return 0n;
}

/**
 * Simulates DeFindex vault `get_asset_amounts_per_shares` (read-only).
 * Returns underlying amounts per asset index for the given vault shares (smallest units).
 */
export async function getAssetAmountsPerShares(
  vaultContractId: string,
  vaultShares: bigint,
  options?: SorobanCallOptions,
): Promise<bigint[] | null> {
  if (!vaultContractId) return null;
  if (vaultShares <= 0n) return [0n];

  try {
    const active = resolveSorobanNetwork();
    const rpcUrl = options?.rpcUrl ?? active.rpcUrl;
    const networkPassphrase = options?.networkPassphrase ?? active.networkPassphrase;
    const contract = new Contract(vaultContractId);
    const server = new rpc.Server(rpcUrl);
    const keypair = Keypair.random();
    const account = new Account(keypair.publicKey(), '0');
    const operation = contract.call(
      'get_asset_amounts_per_shares',
      nativeToScVal(vaultShares, { type: 'i128' }),
    );
    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) {
      console.warn('[defindexVault] get_asset_amounts_per_shares simulation error', simulation.error);
      return null;
    }
    const returnValue = simulation.result?.retval;
    if (!returnValue) return null;
    const native = scValToNative(returnValue) as unknown;
    if (!Array.isArray(native)) return null;
    return native.map((x) => toBigIntSafe(x));
  } catch (error) {
    console.error('[defindexVault] get_asset_amounts_per_shares', error);
    return null;
  }
}
