import {
  Account,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

const EMPTY = { rewardPool: '0', totalDeposits: '0', totalShares: '0' };

const DEFAULT_SOROBAN_RPC = 'https://soroban-testnet.stellar.org';

/** Public Soroban RPC for Stellar mainnet (override with `STELLAR_MAINNET_SOROBAN_RPC`). */
export const DEFAULT_STELLAR_MAINNET_SOROBAN_RPC = 'https://soroban-rpc.mainnet.stellar.org:443';

export type GetPeriodDataOptions = {
  rpcUrl?: string;
  networkPassphrase?: string;
};

function normalizeLockPeriodToSeconds(lockPeriod: number): number {
  if (!Number.isFinite(lockPeriod) || lockPeriod <= 0) return 0;
  // Accept either milliseconds or seconds:
  // - ms values are typically >= 1_000_000 for 7 days (604800000)
  // - s values are typically 604800 / 7776000 / 15552000
  return lockPeriod >= 1_000_000 ? Math.trunc(lockPeriod / 1000) : Math.trunc(lockPeriod);
}

function toBigIntSafe(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === 'string' && v !== '') return BigInt(v);
  return 0n;
}

export type VaquitaPoolPosition = {
  amount: bigint;
  shares: bigint;
  lockPeriodSec: bigint;
};

/**
 * Simulates Vaquita pool `get_position(deposit_id)` (read-only).
 */
export async function getVaquitaPoolPosition(
  poolContractId: string,
  depositIdHex: string,
  rpcUrl: string = DEFAULT_SOROBAN_RPC,
): Promise<VaquitaPoolPosition | null> {
  if (!poolContractId || !depositIdHex) return null;

  try {
    const contract = new Contract(poolContractId);
    const server = new rpc.Server(rpcUrl);
    const keypair = Keypair.random();
    const account = new Account(keypair.publicKey(), '0');
    const operation = contract.call('get_position', nativeToScVal(depositIdHex, { type: 'string' }));
    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) {
      console.warn('[stellar-sdk] get_position simulation error', simulation.error, { poolContractId, depositIdHex });
      return null;
    }
    const returnValue = simulation.result?.retval;
    if (!returnValue) return null;
    const native = scValToNative(returnValue) as unknown;
    if (native == null) return null;
    const p = native as Record<string, unknown>;
    const amount = toBigIntSafe(p.amount);
    const shares = toBigIntSafe(p.shares);
    const lockPeriodSec = toBigIntSafe(p.lock_period ?? p.lockPeriod);
    if (shares <= 0n) return null;
    return { amount, shares, lockPeriodSec };
  } catch (error) {
    console.error('[stellar-sdk] getVaquitaPoolPosition', error, { poolContractId, depositIdHex });
    return null;
  }
}

async function getPeriodData(lockPeriod: number, contractId: string, options?: GetPeriodDataOptions) {
  try {
    const contract = new Contract(contractId);
    const rpcUrl = options?.rpcUrl ?? DEFAULT_SOROBAN_RPC;
    const networkPassphrase = options?.networkPassphrase ?? Networks.TESTNET;
    const server = new rpc.Server(rpcUrl);
    
    // Create a dummy account for simulation
    const keypair = Keypair.random();
    const account = new Account(keypair.publicKey(), '0');
    
    const lockPeriodSeconds = normalizeLockPeriodToSeconds(lockPeriod);
    if (lockPeriodSeconds <= 0) {
      console.warn('Invalid lock period for get_period_data', { lockPeriod, contractId });
      return EMPTY;
    }

    // Create the operation using contract.call()
    const operation = contract.call(
      'get_period_data',
      nativeToScVal(lockPeriodSeconds, { type: 'u64' }),
    );
    
    // Build the transaction
    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
    
    // Simulate the transaction
    const simulation = await server.simulateTransaction(transaction);
    
    // Check for errors
    if (rpc.Api.isSimulationError(simulation)) {
      console.warn('Simulation error:', simulation.error, { lockPeriod, contractId });
      return EMPTY;
    }
    
    // Get the return value
    const returnValue = simulation.result?.retval;
    
    if (!returnValue) {
      console.warn('No period data found', { lockPeriod, contractId });
      return EMPTY;
    }
    
    // Convert the result to native JavaScript types
    const periodData = scValToNative(returnValue);
    
    // Handle Option<Period> - if null/undefined, no data exists
    if (!periodData) {
      console.warn('No period data found for this lock period', { lockPeriod, contractId });
      return EMPTY;
    }
    
    return {
      rewardPool: periodData.reward_pool.toString(),
      totalDeposits: periodData.total_deposits.toString(),
      totalShares: (periodData.total_shares ?? 0).toString(),
    };
    
  } catch (error) {
    console.error('Failed to get period data:', error, { lockPeriod, contractId });
    return EMPTY;
  }
}

export { getPeriodData };

/**
 * Simulates `VaquitaPool::is_paused()` (read-only).
 * Returns `true` if deposits are currently paused, `false` otherwise.
 * Never throws — returns `false` on any error so callers degrade gracefully.
 */
export async function getIsPoolPaused(
  poolContractId: string,
  rpcUrl: string = DEFAULT_SOROBAN_RPC,
  networkPassphrase: string = Networks.TESTNET,
): Promise<boolean> {
  if (!poolContractId) return false;
  try {
    const contract = new Contract(poolContractId);
    const server = new rpc.Server(rpcUrl);
    const keypair = Keypair.random();
    const account = new Account(keypair.publicKey(), '0');
    const operation = contract.call('is_paused');
    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
    const simulation = await server.simulateTransaction(transaction);
    if (rpc.Api.isSimulationError(simulation)) {
      console.warn('[stellar-sdk] is_paused simulation error', simulation.error, { poolContractId });
      return false;
    }
    const returnValue = simulation.result?.retval;
    if (!returnValue) return false;
    return Boolean(scValToNative(returnValue));
  } catch (error) {
    console.error('[stellar-sdk] getIsPoolPaused', error, { poolContractId });
    return false;
  }
}
