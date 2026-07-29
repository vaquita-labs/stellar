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
 * Convert a raw i128 token amount (base units) into human USDC using the token's
 * decimal count. The vault reports share values in the underlying asset's base
 * units; the UI shows human amounts.
 */
export const rawToUsdc = (raw: bigint, decimals: number): number =>
  Number(raw) / 10 ** decimals;

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
