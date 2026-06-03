import { useConfigStore } from '@/core-ui/stores';

export function getVaquitaContract(): string {
  return useConfigStore.getState().token?.vaquitaContractAddress ?? '';
}

export const getDecimals = () => {
  return useConfigStore.getState().token?.decimals ?? 0;
};
