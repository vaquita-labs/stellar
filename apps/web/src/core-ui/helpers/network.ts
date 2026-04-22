import { useNetworkConfigStore } from '../stores';

export const getWalletAddress = () => {
  return useNetworkConfigStore.getState().walletAddress;
};

export const getNetworkName = () => {
  return useNetworkConfigStore.getState().network?.name;
};

export const isEvmType = (types: string[]) => {
  const is = types.includes('EVM');
  return {
    is,
    isUnique: types.length === 1 && is,
  };
};
