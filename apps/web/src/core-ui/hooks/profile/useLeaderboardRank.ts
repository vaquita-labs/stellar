'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { VOLATILE_QUERY_OPTIONS } from '@/core-ui/config/queryFreshness';
import { useQuery } from '@tanstack/react-query';

export const useLeaderboardRank = () => {
  const { walletAddress } = useConfigStore();

  return useQuery<{ rank: number | null; cycleId: number } | null>({
    queryKey: ['leaderboard-rank', walletAddress],
    enabled: !!walletAddress,
    queryFn: async () => {
      const res = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/leaderboard/rank?wallet=${encodeURIComponent(walletAddress ?? '')}`,
      );
      if (!res.ok) return null;
      const body = await res.json();
      return body.data ?? null;
    },
    ...VOLATILE_QUERY_OPTIONS,
    // The rank chip moves with other people's deposits, so it revalidates on
    // mount and reconnect; five minutes of grace keeps it off the render path.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
