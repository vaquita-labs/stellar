import { allowAllModules, StellarWalletsKit, WalletNetwork, FREIGHTER_ID } from '@creit.tech/stellar-wallets-kit';

let kit: StellarWalletsKit | null = null;

export function getStellarWalletsKit(): StellarWalletsKit {
  if (!kit) {
    kit = new StellarWalletsKit({
      network: getNetworkEnum(),
      selectedWalletId: FREIGHTER_ID,
      modules: allowAllModules(),
    });
  }
  return kit;
}

export function getNetworkEnum(): WalletNetwork {
  const n = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET').toUpperCase();
  return n === 'PUBLIC' ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET;
}

export function getNetworkPassphrase(): string {
  const n = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET').toUpperCase();
  return n === 'PUBLIC' ? 'Public Global Stellar Network ; September 2015' : 'Test SDF Network ; September 2015';
}

export function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
}
