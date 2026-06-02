import { useNetworkConfigStore } from '../stores';

export const getWalletAddress = () => {
  return useNetworkConfigStore.getState().walletAddress;
};

export const getNetworkName = () => {
  return useNetworkConfigStore.getState().network?.name;
};
