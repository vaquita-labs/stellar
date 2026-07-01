import { Networks } from '@creit.tech/stellar-wallets-kit';
import { stellarWalletsKit } from '@pollar/stellar-wallets-kit-adapter';

export type StellarNetwork = 'mainnet' | 'testnet';

export function getStellarNetwork(): StellarNetwork {
  const configuredNetwork = process.env.NEXT_PUBLIC_STELLAR_NETWORK?.toLowerCase();
  if (configuredNetwork === 'mainnet' || configuredNetwork === 'testnet') {
    return configuredNetwork;
  }

  const key = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ?? '';
  return key.startsWith('pub_mainnet_') ? 'mainnet' : 'testnet';
}

export function isMainnet(): boolean {
  return getStellarNetwork() === 'mainnet';
}

export function getNetworkEnum(): Networks {
  return isMainnet() ? Networks.PUBLIC : Networks.TESTNET;
}

export function getNetworkPassphrase(): string {
  return getNetworkEnum();
}

export function getRpcUrl(): string {
  if (process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL) {
    return process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL;
  }
  return isMainnet() ? 'https://mainnet.sorobanrpc.com' : 'https://soroban-testnet.stellar.org';
}

export function getHorizonUrl(): string {
  return isMainnet() ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
}

// Resolver consumed by PollarProvider's `walletAdapter` slot. Pollar uses this
// under the hood to let the user pick a Stellar wallet (Freighter, xBull, …)
// during its hosted login flow. The first call lazily runs
// `StellarWalletsKit.init({ modules, network })`.
export const stellarWalletsKitResolver = stellarWalletsKit({ network: getNetworkEnum() });
