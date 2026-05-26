import {
  Account,
  Contract,
  Keypair,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { getRpcUrl, getNetworkPassphrase } from './kit';

const POOL_ERROR_MESSAGES: Record<number, string> = {
  1: 'Contract not initialized',
  2: 'Invalid deposit amount',
  3: 'Deposit ID already exists',
  4: 'Lock period not supported',
  5: 'Position not found',
  6: 'Caller is not the position owner',
  7: 'Invalid fee value',
  8: 'Fee exceeds the 20% cap',
  9: 'Lock period already registered',
  10: 'Lock period not supported',
  11: 'Lock period has open positions',
  12: 'Vault share balance decreased unexpectedly',
  13: 'Vault returned zero shares',
  14: 'Vault returned less than principal',
  15: 'Period data not found',
  16: 'No deposits in this period',
  17: 'Deposits are currently paused',
  18: 'Conservation invariant violated',
  19: 'Arithmetic overflow',
  20: 'No upgrade is pending',
  21: 'Upgrade timelock has not elapsed',
  22: 'Upgrades have been locked forever',
  23: 'Cannot change vault while positions are open',
  24: 'Cannot change token while positions are open',
};

/**
 * Parses a Soroban contract error (e.g. "Error(Contract, #17)") into a
 * human-readable message. Returns null if the error is not a VaquitaPoolError.
 */
export function parsePoolErrorMessage(err: unknown): string | null {
  const str =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : JSON.stringify(err ?? '');
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(str);
  if (!match || !match[1]) return null;
  const code = parseInt(match[1], 10);
  return POOL_ERROR_MESSAGES[code] ?? null;
}

/**
 * Simulate `VaquitaPool::is_paused()` against the Soroban RPC.
 * Never throws — returns `false` on error so callers degrade gracefully.
 */
export async function getIsPoolPaused(contractId: string): Promise<boolean> {
  if (!contractId) return false;
  try {
    const rpcUrl = getRpcUrl();
    const networkPassphrase = getNetworkPassphrase() as Networks;
    const contract = new Contract(contractId);
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
    if (rpc.Api.isSimulationError(simulation)) return false;
    const returnValue = simulation.result?.retval;
    if (!returnValue) return false;
    return Boolean(scValToNative(returnValue));
  } catch {
    return false;
  }
}
