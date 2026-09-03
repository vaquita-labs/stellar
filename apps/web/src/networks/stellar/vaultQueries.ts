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
import { useConfigStore } from '@/core-ui/stores';
import type { NetworkResponseDTO } from '@/core-ui/types';
import { getNetworkPassphrase, getRpcUrl } from './kit';
import { parseVaultError } from './vaultError';

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
 *
 * `decimals` is part of that contract: a token row without it reaches the client
 * as 0 (see `toProjectConfig`), and every amount on this path is scaled by
 * `10 ** decimals` — so a missing value would read balances 10⁷x too large and
 * under-scale deposits. Treated as unconfigured rather than silently wrong.
 */
export const defindexVaultConfigForToken = (
  token: NetworkResponseDTO['tokens'][number] | null,
): DefindexVaultConfig | null => {
  if (!token?.defindexVaultContractAddress || !token.contractAddress || !token.decimals) return null;
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

/**
 * Render a raw i128 amount as the decimal string the deposit/withdraw entry
 * points take. Exact by construction: `toBaseUnits` on the result gives `raw`
 * back, with no float in between — which matters when the amount being passed
 * along is a balance delta that has to move in full.
 */
export const formatBaseUnits = (raw: bigint, decimals: number): string => {
  if (decimals <= 0) return raw.toString();
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, '0');
  const value = `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
  return negative ? `-${value}` : value;
};

/**
 * Parse a DeFindex vault contract error (e.g. "Error(Contract, #412)") into a
 * human-readable message in the active language. Returns null when the error is
 * not a recognized vault error, so callers can fall back to a generic message.
 *
 * El mapa vive en `./vaultError` junto con `VaultContractError`, que es lo que
 * hay que tirar cuando el error va a viajar: esta función se queda solo con la
 * frase y pierde el código.
 */
export function parseVaultErrorMessage(err: unknown): string | null {
  return parseVaultError(err)?.message ?? null;
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
 * Convert a USDC amount (raw base units) into vault shares, rounded UP:
 * `shares = ceil(usdcRaw * totalSupply / totalManaged)`.
 *
 * Up, not down. Once the vault has appreciated a share is worth more than one
 * USDC, so flooring the conversion throws away a fraction of a share and the
 * vault pays out `floor(shares * totalManaged / totalSupply)` — one base unit
 * SHORT of what was asked for. The portfolio withdraw loses that stroop
 * silently, but the fiat off-ramps hand the provider an exact quoted amount and
 * it rejects the payment ("needs 0.96 USDC, wallet holds 0.9599999"). Rounding
 * up restores the invariant that withdrawing X delivers at least X:
 * `floor(ceil(x·S/M)·M/S) >= x`.
 *
 * The extra share can push the request past what the holder actually owns, so
 * every caller caps the result at their balance — asking for the whole position
 * then burns exactly the position, which is what it did before.
 */
export const usdcToShares = (usdcRaw: bigint, totalSupply: bigint, totalManaged: bigint): bigint =>
  totalManaged <= 0n ? 0n : (usdcRaw * totalSupply + totalManaged - 1n) / totalManaged;

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
