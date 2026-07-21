import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type RedeemAchievementCodeResponse = {
  achievementKey: string;
  coinReward: number;
};

/**
 * Mutation that redeems a code for a hidden / code-gated achievement.
 *
 * The server validates the code and creates/returns a pending mint voucher.
 * Rewards are granted later by `/mint` after the on-chain mint succeeds.
 */
export const useRedeemAchievementCode = () => {
  const queryClient = useQueryClient();
  const { network, walletAddress } = useConfigStore();

  return useMutation<RedeemAchievementCodeResponse, Error, string>({
    mutationFn: async (code) => {
      if (!walletAddress) throw new Error('No connected wallet');
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/wallets/${walletAddress}/badges/redeem`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        },
        walletAddress,
      );

      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) {
        const message: string =
          body?.message ?? body?.error ?? `Failed to redeem code (${response.status})`;
        throw new Error(message);
      }

      return body.data as RedeemAchievementCodeResponse;
    },
    onSuccess: () => {
      const networkName = network?.networkName;
      void queryClient.invalidateQueries({
        queryKey: ['profile', networkName, walletAddress, 'profile-achievements'],
      });
    },
  });
};
