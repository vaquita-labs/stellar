import { getWalletAddress } from '@/core-ui/helpers';
import { useNetworkConfigStore } from '@/core-ui/stores';

export const isDummyNetwork = () => {
  return useNetworkConfigStore.getState().network?.name === 'Dummy';
};

export const isDummyWalletConnected = () => {
  const walletAddress = getWalletAddress();
  return !!walletAddress && isDummyNetwork();
};
