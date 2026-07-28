import { Networks } from '@stellar/stellar-sdk';
import { env } from '../../config/env';
import { passphraseForNetwork } from './passphrase';

export type SorobanNetwork = 'mainnet' | 'testnet';

/**
 * Soroban RPC URL for the given network, from the required per-network env
 * vars STELLAR_MAINNET_SOROBAN_RPC_URL / STELLAR_TESTNET_SOROBAN_RPC_URL
 * (validated with zod at boot in config/env.ts).
 */
export function requireSorobanRpcUrl(network: SorobanNetwork): string {
  return network === 'mainnet'
    ? env.STELLAR_MAINNET_SOROBAN_RPC_URL
    : env.STELLAR_TESTNET_SOROBAN_RPC_URL;
}

/**
 * Soroban RPC URL for the ACTIVE network (derived from STELLAR_NETWORK).
 */
export function resolveSorobanRpcUrl(): string {
  const network: SorobanNetwork =
    passphraseForNetwork(process.env.STELLAR_NETWORK) === Networks.PUBLIC ? 'mainnet' : 'testnet';
  return requireSorobanRpcUrl(network);
}
