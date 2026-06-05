import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import type { ClaimAchievementResponseDTO } from '@/core-ui/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Mutation that redeems a code for a hidden / code-gated achievement.
 *
 * The server side checks (in order): code exists → user hasn't claimed it →
 * insert ledger + reward in one tx. On success the same three queries used by
 * the regular claim flow get invalidated so the UI updates without a manual
 * refetch:
 *  - `profile-achievements` → the badge appears in the list as claimed.
 *  - `profile-rewards`      → gold-coin balance bumps by `coinReward`.
 *  - `profile-experience`   → if XP ever derives from coin rewards.
 */
export const useRedeemAchievementCode = () => {
  const queryClient = useQueryClient();
  const { network, walletAddress } = useConfigStore();

  return useMutation<ClaimAchievementResponseDTO, Error, string>({
    mutationFn: async (code) => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/wallets/${walletAddress}/badges/redeem`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        },
      );

      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) {
        const message: string =
          body?.message ?? body?.error ?? `Failed to redeem code (${response.status})`;
        throw new Error(message);
      }

      return body.data as ClaimAchievementResponseDTO;
    },
    onSuccess: () => {
      const networkName = network?.networkName;
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
