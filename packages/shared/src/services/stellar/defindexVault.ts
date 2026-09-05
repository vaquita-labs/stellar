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

/**
 * Simulates DeFindex vault `fetch_total_managed_funds` (read-only) and returns
 * the first asset's total managed amount in smallest units — idle plus invested,
 * i.e. everything the vault currently holds on behalf of its shareholders.
 *
 * Single-asset by design: the Vaquita vault holds one asset (USDC), so `funds[0]`
 * IS the vault's total. Summing every entry would silently add up different
 * currencies the day a second asset is added, which is worse than reading short.
 *
 * Returns `null` when the vault is unset or the simulation fails, so a failed
 * read is never mistaken for an empty vault.
 */
export async function getVaultTotalManagedFunds(
  vaultContractId: string,
  options?: SorobanCallOptions,
): Promise<bigint | null> {
  if (!vaultContractId) return null;

  try {
    const active = resolveSorobanNetwork();
    const rpcUrl = options?.rpcUrl ?? active.rpcUrl;
    const networkPassphrase = options?.networkPassphrase ?? active.networkPassphrase;
    const contract = new Contract(vaultContractId);
    const server = new rpc.Server(rpcUrl);
    const keypair = Keypair.random();
    const account = new Account(keypair.publicKey(), '0');
    const transaction = new TransactionBuilder(account, { fee: '100', networkPassphrase })
      .addOperation(contract.call('fetch_total_managed_funds'))
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) {
      console.warn('[defindexVault] fetch_total_managed_funds simulation error', simulation.error);
      return null;
    }
    const returnValue = simulation.result?.retval;
    if (!returnValue) return null;
    const native = scValToNative(returnValue) as unknown;
    if (!Array.isArray(native) || native.length === 0) return null;
    const first = native[0] as { total_amount?: unknown } | undefined;
    if (!first || first.total_amount == null) return null;
    return toBigIntSafe(first.total_amount);
  } catch (error) {
    console.error('[defindexVault] fetch_total_managed_funds', error);
    return null;
  }
}
