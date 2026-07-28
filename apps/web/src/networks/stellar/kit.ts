import { clientEnv } from '@/core-ui/config/clientEnv';
import { Networks } from '@creit.tech/stellar-wallets-kit';

export type StellarNetwork = 'mainnet' | 'testnet';

export function getStellarNetwork(): StellarNetwork {
  return clientEnv.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY.startsWith('pub_mainnet_')
    ? 'mainnet'
    : 'testnet';
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
  return isMainnet()
    ? clientEnv.NEXT_PUBLIC_STELLAR_MAINNET_SOROBAN_RPC_URL
    : clientEnv.NEXT_PUBLIC_STELLAR_TESTNET_SOROBAN_RPC_URL;
}

export function getHorizonUrl(): string {
  return isMainnet() ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
}
