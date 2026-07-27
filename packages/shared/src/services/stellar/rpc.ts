import { Networks } from '@stellar/stellar-sdk';
import { passphraseForNetwork } from './passphrase';

export type SorobanNetwork = 'mainnet' | 'testnet';

/**
 * Soroban RPC URL for the given network. Read from the per-network env vars
 * STELLAR_MAINNET_SOROBAN_RPC_URL / STELLAR_TESTNET_SOROBAN_RPC_URL — both required
 * (validated with zod at boot in config/env.ts). Throws when unset so a
 * misconfigured deployment fails fast instead of silently querying a public
 * endpoint of the wrong network.
 */
export function requireSorobanRpcUrl(network: SorobanNetwork): string {
  const name = network === 'mainnet' ? 'STELLAR_MAINNET_SOROBAN_RPC_URL' : 'STELLAR_TESTNET_SOROBAN_RPC_URL';
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured. Set it in the service environment.`);
  }
  return value;
}

/**
 * Soroban RPC URL for the ACTIVE network (derived from STELLAR_NETWORK).
 */
export function resolveSorobanRpcUrl(): string {
  const network: SorobanNetwork =
    passphraseForNetwork(process.env.STELLAR_NETWORK) === Networks.PUBLIC ? 'mainnet' : 'testnet';
  return requireSorobanRpcUrl(network);
}
