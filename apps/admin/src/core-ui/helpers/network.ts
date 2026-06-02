import { useNetworkConfigStore } from '../stores';

export const getWalletAddress = () => {
  return useNetworkConfigStore.getState().walletAddress;
};
