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
import i18n from '@/core-ui/i18n';

// Soroban error code → i18n key (+ English fallback). Kept as keys, NOT
// pre-translated strings: the translation happens per-call in
// `parsePoolErrorMessage` so it follows the active language and never runs i18n
// at module-evaluation time (which would break on the server / be non-reactive).
const POOL_ERROR_KEYS: Record<number, { key: string; fallback: string }> = {
  1: { key: 'errors.pool.notInitialized', fallback: 'Contract not initialized' },
  2: { key: 'errors.pool.invalidDepositAmount', fallback: 'Invalid deposit amount' },
  3: { key: 'errors.pool.depositIdExists', fallback: 'Deposit ID already exists' },
  4: { key: 'errors.pool.lockPeriodNotSupported', fallback: 'Lock period not supported' },
  5: { key: 'errors.pool.positionNotFound', fallback: 'Position not found' },
  6: { key: 'errors.pool.notPositionOwner', fallback: 'Caller is not the position owner' },
  7: { key: 'errors.pool.invalidFeeValue', fallback: 'Invalid fee value' },
  8: { key: 'errors.pool.feeExceedsCap', fallback: 'Fee exceeds the 20% cap' },
  9: { key: 'errors.pool.lockPeriodAlreadyRegistered', fallback: 'Lock period already registered' },
  10: { key: 'errors.pool.lockPeriodNotSupported', fallback: 'Lock period not supported' },
  11: { key: 'errors.pool.lockPeriodHasOpenPositions', fallback: 'Lock period has open positions' },
  12: { key: 'errors.pool.vaultShareBalanceDecreased', fallback: 'Vault share balance decreased unexpectedly' },
  13: { key: 'errors.pool.vaultReturnedZeroShares', fallback: 'Vault returned zero shares' },
  14: { key: 'errors.pool.vaultReturnedLessThanPrincipal', fallback: 'Vault returned less than principal' },
  15: { key: 'errors.pool.periodDataNotFound', fallback: 'Period data not found' },
  16: { key: 'errors.pool.noDepositsInPeriod', fallback: 'No deposits in this period' },
  17: { key: 'errors.pool.depositsPaused', fallback: 'Deposits are currently paused' },
  18: { key: 'errors.pool.conservationInvariantViolated', fallback: 'Conservation invariant violated' },
  19: { key: 'errors.pool.arithmeticOverflow', fallback: 'Arithmetic overflow' },
  20: { key: 'errors.pool.noUpgradePending', fallback: 'No upgrade is pending' },
  21: { key: 'errors.pool.upgradeTimelockNotElapsed', fallback: 'Upgrade timelock has not elapsed' },
  22: { key: 'errors.pool.upgradesLockedForever', fallback: 'Upgrades have been locked forever' },
  23: { key: 'errors.pool.cannotChangeVaultWithOpenPositions', fallback: 'Cannot change vault while positions are open' },
  24: { key: 'errors.pool.cannotChangeTokenWithOpenPositions', fallback: 'Cannot change token while positions are open' },
};

/**
 * Parses a Soroban contract error (e.g. "Error(Contract, #17)") into a
 * human-readable message in the active language. Returns null if the error is
 * not a VaquitaPoolError.
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
  const entry = POOL_ERROR_KEYS[code];
  return entry ? i18n.t(entry.key, entry.fallback) : null;
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
