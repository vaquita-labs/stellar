import { Networks } from '@stellar/stellar-sdk';
import { env } from '../../config/env';
import { resolveNetworkPassphrase } from './passphrase';

export type SorobanNetwork = 'mainnet' | 'testnet';

/** RPC endpoint plus the passphrase that goes with it. */
export type SorobanCallOptions = {
  rpcUrl?: string;
  networkPassphrase?: string;
};

/**
 * Soroban RPC URL for the given network, from the required per-network env
 * vars STELLAR_MAINNET_SOROBAN_RPC_URL / STELLAR_TESTNET_SOROBAN_RPC_URL
 * (validated with zod at boot in config/env.ts).
 */
export function requireSorobanRpcUrl(network: SorobanNetwork): string {
  return network === 'mainnet' ? env.STELLAR_MAINNET_SOROBAN_RPC_URL : env.STELLAR_TESTNET_SOROBAN_RPC_URL;
}

/**
 * The ACTIVE network, derived from STELLAR_NETWORK. Throws when that is unset or
 * unrecognized (see `resolveNetworkPassphrase`) rather than assuming a side.
 */
export function resolveSorobanNetworkName(): SorobanNetwork {
  return resolveNetworkPassphrase() === Networks.PUBLIC ? 'mainnet' : 'testnet';
}

/** Soroban RPC URL for the ACTIVE network. */
export function resolveSorobanRpcUrl(): string {
  return requireSorobanRpcUrl(resolveSorobanNetworkName());
}

/**
 * RPC endpoint AND passphrase for the ACTIVE network, as one value.
 *
 * They must be resolved together: a read-only simulation still builds a real
 * transaction, and the passphrase is mixed into it, so an endpoint on one
 * network with a passphrase from the other simulates against a chain where the
 * contract does not exist — which surfaces as a simulation error the caller
 * usually swallows into "0", not as a crash. Every on-chain read here takes this
 * as its default so no call site has to remember the pairing.
 */
export function resolveSorobanNetwork(): Required<SorobanCallOptions> {
  const networkPassphrase = resolveNetworkPassphrase();
  const rpcUrl = requireSorobanRpcUrl(networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet');
  return { rpcUrl, networkPassphrase };
}
