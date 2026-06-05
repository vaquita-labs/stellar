import { getWalletAddress } from '@/core-ui/helpers';
import { useConfigStore } from '@/core-ui/stores';

export const isStellarNetwork = (networkName: string) => {
  return networkName === 'Stellar' || networkName === 'Stellar Testnet';
};

export const isStellarWalletConnected = () => {
  const walletAddress = getWalletAddress();
  return !!walletAddress && isStellarNetwork(useConfigStore.getState().network?.networkName ?? '');
};

/**
 * stellar.expert path segment for the active network. The config provider is
 * the single source of truth: it derives `network.type` from the passphrase
 * ("public" → mainnet). Note stellar.expert names mainnet `public`, not `mainnet`.
 * Pass `type` from a React `useConfigStore` selector for reactivity; omit it in
 * non-React code to read the current store value.
 */
export const stellarExpertNetwork = (type?: string | null) => {
  const networkType = type ?? useConfigStore.getState().network?.type;
  return networkType === 'mainnet' ? 'public' : 'testnet';
};

/** Builds a stellar.expert transaction URL for the active network. */
export const stellarExpertTxUrl = (hash: string, type?: string | null) =>
  `https://stellar.expert/explorer/${stellarExpertNetwork(type)}/tx/${hash}`;
