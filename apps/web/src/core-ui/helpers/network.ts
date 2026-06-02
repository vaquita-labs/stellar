import { useConfigStore } from '../stores';

export const getWalletAddress = () => {
  return useConfigStore.getState().walletAddress;
};

export const getNetworkName = () => {
  return useConfigStore.getState().network?.networkName;
};
