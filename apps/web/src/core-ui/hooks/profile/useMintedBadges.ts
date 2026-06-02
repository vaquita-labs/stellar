'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { useQuery } from '@tanstack/react-query';

interface MintedBadge {
  badge_type: string;
  confirmed_at: string;
  transaction_hash: string;
}

/**
 * Query that returns the set of badge types the wallet has minted on-chain.
 * Uses the confirmed_at column to distinguish minted vs merely claimed badges.
 */
export const useMintedBadges = () => {
  const { network, walletAddress } = useConfigStore();
  const networkName = network?.networkName ?? '';
  const baseUrl = `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1`;

  const query = useQuery<Set<string>>({
    queryKey: ['minted-badges', networkName, walletAddress],
    queryFn: async () => {
      if (!walletAddress || !networkName) return new Set<string>();
      const res = await fetch(
        `${baseUrl}/claim/${networkName}/minted?wallet=${encodeURIComponent(walletAddress)}`,
      );
      if (!res.ok) return new Set<string>();
      const body = await res.json();
      const badges: MintedBadge[] = body.data ?? [];
      return new Set(badges.map((b) => b.badge_type));
    },
    enabled: !!walletAddress && !!networkName,
    staleTime: 30_000,
  });

  return {
    ...query,
    isMinted: (badgeType: string) => query.data?.has(badgeType) ?? false,
  };
};
