import { Networks } from '@stellar/stellar-sdk';
import { passphraseForNetwork } from './passphrase';
import { DEFAULT_STELLAR_MAINNET_SOROBAN_RPC } from './stellar-sdk';

const DEFAULT_TESTNET_SOROBAN_RPC = 'https://soroban-testnet.stellar.org';

/**
 * Soroban RPC URL for the active network (STELLAR_NETWORK). Honors an explicit
 * STELLAR_SOROBAN_RPC override; otherwise falls back to the public endpoint for
 * the network. Optional by design — the public defaults work but are
 * rate-limited, so production should set its own.
 */
export function resolveSorobanRpcUrl(): string {
  const override = process.env.STELLAR_SOROBAN_RPC?.trim();
  if (override) return override;

  return passphraseForNetwork(process.env.STELLAR_NETWORK) === Networks.PUBLIC
    ? DEFAULT_STELLAR_MAINNET_SOROBAN_RPC
    : DEFAULT_TESTNET_SOROBAN_RPC;
}
