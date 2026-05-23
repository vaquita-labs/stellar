import { Networks } from '@creit.tech/stellar-wallets-kit';
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';

export function getNetworkEnum(): Networks {
  const n = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET').toUpperCase();
  return n === 'PUBLIC' ? Networks.PUBLIC : Networks.TESTNET;
}

export function getNetworkPassphrase(): string {
  return getNetworkEnum();
}

export function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
}

// Resolver consumed by PollarProvider's `walletAdapter` slot. Pollar uses this
// under the hood to let the user pick a Stellar wallet (Freighter, xBull, …)
// during its hosted login flow. The first call lazily runs
// `StellarWalletsKit.init({ modules, network })`.
export const stellarWalletsKitResolver = stellarWalletsKit({ network: getNetworkEnum() });
