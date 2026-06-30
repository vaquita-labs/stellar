import { useConfigStore } from '../stores';

export const getWalletAddress = () => {
  console.log('getWalletAddress()', useConfigStore.getState());
  return useConfigStore.getState().walletAddress;
};

export const getNetworkName = () => {
  return useConfigStore.getState().network?.networkName;
};
