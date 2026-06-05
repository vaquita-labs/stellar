import { getWalletAddress } from '@/core-ui/helpers';
import { useConfigStore } from '@/core-ui/stores';

export const isStellarNetwork = (networkName: string) => {
  return networkName === 'Stellar' || networkName === 'Stellar Testnet';
};

export const isStellarWalletConnected = () => {
  const walletAddress = getWalletAddress();
  return !!walletAddress && isStellarNetwork(useConfigStore.getState().network?.networkName ?? '');
};
