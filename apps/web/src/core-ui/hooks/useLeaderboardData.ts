import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { LeaderboardResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';
import { ONE_MINUTE } from '../config/constants';

export const leaderboardQueryKey = (networkName?: string, cycle = 'current') => [
  'leaderboard',
  'network',
  networkName,
  cycle,
] as const;

export const useLeaderboardData = (cycle = 'current') => {
  const { network } = useConfigStore();

  return useQuery<LeaderboardResponseDTO[]>({
    queryKey: leaderboardQueryKey(network?.networkName, cycle),
    queryFn: async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/leaderboard?cycle=${encodeURIComponent(cycle)}`,
      );
      const data = await response.json();

      return (data?.data ?? []).map((row: LeaderboardResponseDTO) => ({
        position: row?.position ?? 0,
        walletAddress: row?.walletAddress ?? '',
        nickname: row?.nickname ?? '',
        avatarUrl: row?.avatarUrl ?? '',
        badges: row?.badges ?? 0,
        streak: row?.streak ?? 0,
        experience: row?.experience ?? 0,
        score: row?.score ?? 0,
        activeAmount: row?.activeAmount ?? 0,
        cycleId: row?.cycleId ?? 0,
        cycleStart: row?.cycleStart ?? 0,
        cycleEnd: row?.cycleEnd ?? 0,
        cycleStatus: row?.cycleStatus ?? 'current',
      }));
    },
    refetchInterval: ONE_MINUTE * 5,
    enabled: !!network?.networkName,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
};
