import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import type { ClaimAchievementResponseDTO } from '@/core-ui/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Mutation that claims an achievement on the server. Currently fire-and-go:
 * the server trusts wallet-in-URL (see // TODO(auth) on the route). When the
 * API-wide auth hardening lands, this mutation will sign a challenge via
 * `StellarWalletsKit.signMessage(...)` and include the result in the body.
 *
 * onSuccess invalidates the three queries the claim touches so the UI updates
 * without a manual refetch — the achievements list flips to `claimedAt`, the
 * gold-coin balance bumps, and the experience pill (if it tracks rewards)
 * re-runs its math.
 */
export const useClaimAchievement = () => {
  const queryClient = useQueryClient();
  const { network, walletAddress } = useNetworkConfigStore();

  return useMutation<ClaimAchievementResponseDTO, Error, string>({
    mutationFn: async (achievementKey) => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/network/${network?.name}/wallet/${walletAddress}/achievements/${achievementKey}/claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) {
        const message: string =
          body?.message ?? body?.error ?? `Failed to claim achievement (${response.status})`;
        throw new Error(message);
      }

      return body.data as ClaimAchievementResponseDTO;
    },
    onSuccess: () => {
      const networkName = network?.name;
      void queryClient.invalidateQueries({
        queryKey: ['profile', networkName, walletAddress, 'profile-achievements'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['profile', networkName, walletAddress, 'profile-rewards'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['profile', networkName, walletAddress, 'profile-experience'],
      });
    },
  });
};
