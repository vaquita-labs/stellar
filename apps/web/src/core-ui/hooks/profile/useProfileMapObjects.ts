import { useConfigStore } from '@/core-ui/stores';
import { useProfileMapObjectsByWallet } from './useProfileMapObjectsByWallet';

/**
 * Map objects for the logged-in user. Thin wrapper over
 * {@link useProfileMapObjectsByWallet} so there's a single fetch/parse path.
 */
export const useProfileMapObjects = () => {
  const { walletAddress } = useConfigStore();
  return useProfileMapObjectsByWallet(walletAddress);
};
