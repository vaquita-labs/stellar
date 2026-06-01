import { useNetworkConfigStore } from '@/core-ui/stores';

export function getVaquitaContract(): string {
  return useNetworkConfigStore.getState().token?.vaquitaContractAddress ?? '';
}

export const getDecimals = () => {
  return useNetworkConfigStore.getState().token?.decimals ?? 0;
};
