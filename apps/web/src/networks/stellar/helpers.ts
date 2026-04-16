import { getWalletAddress } from '@/core-ui/helpers';
import { useNetworkConfigStore } from '@/core-ui/stores';

export const isStellarNetwork = (networkName: string) => {
  return networkName === 'Stellar' || networkName === 'Stellar Testnet';
};

export const isStellarWalletConnected = () => {
  const walletAddress = getWalletAddress();
  return !!walletAddress && isStellarNetwork(useNetworkConfigStore.getState().network?.name ?? '');
};
