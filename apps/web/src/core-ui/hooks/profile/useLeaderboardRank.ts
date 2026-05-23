'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { useQuery } from '@tanstack/react-query';

export const useLeaderboardRank = () => {
  const { network, walletAddress } = useNetworkConfigStore();
  const networkName = network?.name ?? '';

  return useQuery<{ rank: number | null; cycleId: number } | null>({
    queryKey: ['leaderboard-rank', networkName, walletAddress],
    enabled: !!networkName && !!walletAddress,
    queryFn: async () => {
      const res = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/network/${encodeURIComponent(networkName)}/leaderboard/rank?wallet=${encodeURIComponent(walletAddress ?? '')}`,
      );
      if (!res.ok) return null;
      const body = await res.json();
      return body.data ?? null;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
