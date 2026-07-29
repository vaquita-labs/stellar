import {
  Account,
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import i18n from '@/core-ui/i18n';
import { useConfigStore } from '@/core-ui/stores';
import type { NetworkResponseDTO } from '@/core-ui/types';
import { getNetworkPassphrase, getRpcUrl } from './kit';

export interface DefindexVaultConfig {
  /** The DeFindex vault contract (also the df-token whose `balance` is the position). */
  vaultId: string;
  /** USDC SAC — the vault's underlying asset. */
  usdcId: string;
  /** Decimals of the underlying asset (USDC = 7). */
  decimals: number;
}

/**
 * Resolve the DeFindex vault config from the active token row (DB → API → config
 * store), same source as the Blend and Vaquita-pool configs. Null while the config
 * has not loaded or when the token has no DeFindex vault configured.
 */
export const defindexVaultConfigForToken = (
  token: NetworkResponseDTO['tokens'][number] | null,
): DefindexVaultConfig | null => {
  if (!token?.defindexVaultContractAddress || !token.contractAddress) return null;
  return {
    vaultId: token.defindexVaultContractAddress,
    usdcId: token.contractAddress,
    decimals: token.decimals,
  };
};

/**
 * Non-reactive read of the active token's DeFindex vault config, for imperative
 * call sites (transaction submission). React code must derive it from the store
 * subscription instead: `defindexVaultConfigForToken(useConfigStore(s => s.token))`.
 */
export const getDefindexVaultConfig = (): DefindexVaultConfig | null =>
  defindexVaultConfigForToken(useConfigStore.getState().token);

/**
 * Convert a raw i128 token amount (base units) into human USDC using the token's
 * decimal count. The vault reports share values in the underlying asset's base
 * units; the UI shows human amounts.
 */
export const rawToUsdc = (raw: bigint, decimals: number): number =>
  Number(raw) / 10 ** decimals;

// DeFindex vault ContractError code → i18n key (+ English fallback). Subset the
// UI can actually hit on deposit/withdraw (the vault's full Errors enum is much
// larger — governance/rebalance codes never reach an end user). Same shape and
// per-call translation as POOL_ERROR_KEYS in poolQueries.ts.
const VAULT_ERROR_KEYS: Record<number, { key: string; fallback: string }> = {
  412: { key: 'errors.vault.insufficientBalance', fallback: 'Not enough balance' },
  124: { key: 'errors.vault.amountOverTotalSupply', fallback: 'Amount exceeds the vault supply, please retry' },
  114: { key: 'errors.vault.insufficientManagedFunds', fallback: "The vault can't cover this right now, please retry" },
  451: { key: 'errors.vault.amountBelowMinDust', fallback: 'Amount is too small' },
  452: { key: 'errors.vault.underlyingAmountBelowMin', fallback: 'Price moved past your limit, please retry' },
  453: { key: 'errors.vault.bTokensAmountBelowMin', fallback: 'Price moved past your limit, please retry' },
  410: { key: 'errors.vault.negativeNotAllowed', fallback: 'Invalid amount' },
  417: { key: 'errors.vault.onlyPositiveAmount', fallback: 'Amount must be greater than zero' },
  401: { key: 'errors.vault.notInitialized', fallback: 'Vault is not ready' },
  418: { key: 'errors.vault.notAuthorized', fallback: 'Not authorized' },
  130: { key: 'errors.vault.unauthorized', fallback: 'Not authorized' },
};

/**
 * Parse a DeFindex vault contract error (e.g. "Error(Contract, #412)") into a
 * human-readable message in the active language. Returns null when the error is
 * not a recognized vault error, so callers can fall back to a generic message.
 */
export function parseVaultErrorMessage(err: unknown): string | null {
  const str =
    err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err ?? '');
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(str);
  if (!match || !match[1]) return null;
  const entry = VAULT_ERROR_KEYS[parseInt(match[1], 10)];
  return entry ? i18n.t(entry.key, entry.fallback) : null;
}

export interface DefindexVaultPosition {
  /** df-token (share) balance held by the address. */
  shares: bigint;
  /** USDC value of those shares, in human units. */
  usdc: number;
}

const EMPTY_POSITION: DefindexVaultPosition = { shares: 0n, usdc: 0 };

// Simulate a read-only vault call. Mirrors the pattern in poolQueries.ts: a
// throwaway source account, a single contract call, simulate, decode retval.
// Throws on simulation error so react-query can retry (money reads must not
// silently degrade to 0 — that would flash the balance to $0).
const simulateVaultCall = async (
  vaultId: string,
  method: string,
  ...args: xdr.ScVal[]
): Promise<unknown> => {
  const server = new rpc.Server(getRpcUrl());
  const contract = new Contract(vaultId);
  const account = new Account(Keypair.random().publicKey(), '0');
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) {
    throw new Error(`vault ${method} simulation failed`);
  }
  return scValToNative(sim.result.retval);
};

/** Withdraw slippage floor (0.5%): a safety margin against NAV drift / strategy
 *  unwind rounding between simulate and execution, not an expected loss. */
export const WITHDRAW_SLIPPAGE_BPS = 50;

/** Read a wallet's df-token (share) balance. */
export const getVaultShares = async (config: DefindexVaultConfig, address: string): Promise<bigint> => {
  if (!address) return 0n;
  return (await simulateVaultCall(config.vaultId, 'balance', new Address(address).toScVal())) as bigint;
};

/** USDC (raw base units) that a given share count is worth (single-asset, index 0). */
export const getVaultUsdcForShares = async (
  config: DefindexVaultConfig,
  shares: bigint,
): Promise<bigint> => {
  if (shares <= 0n) return 0n;
  const amounts = (await simulateVaultCall(
    config.vaultId,
    'get_asset_amounts_per_shares',
    nativeToScVal(shares, { type: 'i128' }),
  )) as bigint[];
  return Array.isArray(amounts) ? (amounts[0] ?? 0n) : (amounts as unknown as bigint);
};

/** Total df-token supply and total managed USDC (raw), for USDC→shares math. */
export const getVaultTotals = async (
  config: DefindexVaultConfig,
): Promise<{ totalSupply: bigint; totalManaged: bigint }> => {
  const totalSupply = (await simulateVaultCall(config.vaultId, 'total_supply')) as bigint;
  const funds = (await simulateVaultCall(config.vaultId, 'fetch_total_managed_funds')) as Array<{
    total_amount: bigint;
  }>;
  const totalManaged = Array.isArray(funds) ? (funds[0]?.total_amount ?? 0n) : 0n;
  return { totalSupply, totalManaged };
};

/**
 * Convert a USDC amount (raw base units) into vault shares, floored so it never
 * rounds up past the user's holdings: `shares = usdcRaw * totalSupply / totalManaged`.
 * BigInt division truncates toward zero (both operands positive → floor).
 */
export const usdcToShares = (usdcRaw: bigint, totalSupply: bigint, totalManaged: bigint): bigint =>
  totalManaged <= 0n ? 0n : (usdcRaw * totalSupply) / totalManaged;

/** Apply a basis-point floor to a raw amount (for min_amounts_out). */
export const applySlippageFloor = (raw: bigint, bps: number): bigint =>
  (raw * BigInt(10_000 - bps)) / 10_000n;

/**
 * Read a wallet's DeFindex vault position on-chain: its df-token `balance`, then
 * the USDC that share count is worth via `get_asset_amounts_per_shares` (index 0,
 * single-asset vault). Zero shares short-circuits without the second call.
 */
export const getVaultPosition = async (
  config: DefindexVaultConfig,
  address: string,
): Promise<DefindexVaultPosition> => {
  if (!address) return EMPTY_POSITION;
  const shares = (await simulateVaultCall(
    config.vaultId,
    'balance',
    new Address(address).toScVal(),
  )) as bigint;
  if (!shares || shares <= 0n) return EMPTY_POSITION;

  const amounts = (await simulateVaultCall(
    config.vaultId,
    'get_asset_amounts_per_shares',
    nativeToScVal(shares, { type: 'i128' }),
  )) as bigint[];
  const raw = Array.isArray(amounts) ? (amounts[0] ?? 0n) : (amounts as unknown as bigint);
  return { shares, usdc: rawToUsdc(raw, config.decimals) };
};
