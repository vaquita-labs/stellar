'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useQuery } from '@tanstack/react-query';
import { resolveAvatarConfig, type AvatarConfig } from '@vaquita/avatar';

/**
 * The referrer board, as the signed-in wallet sees it.
 *
 * `authFetch` like [[useReferralSummary]]: the endpoint enumerates who brought
 * whom, so it reads the wallet from the session token rather than the URL, and
 * "which row is mine" is answered by the server for the same reason.
 *
 * Counts only. What a referrer's friends hold or have moved lives in the
 * internal metrics dashboard and deliberately never reaches this screen.
 */
export interface ReferrerLeaderboardRow {
  /** True rank over every referrer, so a pinned row shows a real position. */
  position: number;
  walletAddress: string;
  nickname: string;
  avatarConfig: AvatarConfig;
  /** Friends who joined through their link. The ranking key. */
  referrals: number;
  /** How many of those friends are saving right now. */
  activeReferrals: number;
  isCurrentUser: boolean;
}

export interface ReferrerLeaderboard {
  rows: ReferrerLeaderboardRow[];
  /** The viewer's own row, wherever they rank. Null when they have referred nobody. */
  me: ReferrerLeaderboardRow | null;
  total: number;
}

const boardKey = (walletAddress?: string | null) => ['referral', 'leaderboard', walletAddress] as const;

const BASE = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/referrals`;

/** Fills in the two fields the row cannot render without, whatever the API sent. */
const toRow = (raw: Partial<ReferrerLeaderboardRow> | null | undefined): ReferrerLeaderboardRow | null => {
  if (!raw?.walletAddress) return null;
  return {
    position: raw.position ?? 0,
    walletAddress: raw.walletAddress,
    nickname: (raw.nickname ?? '').trim(),
    avatarConfig: resolveAvatarConfig(raw.avatarConfig, raw.walletAddress),
    referrals: raw.referrals ?? 0,
    activeReferrals: raw.activeReferrals ?? 0,
    isCurrentUser: raw.isCurrentUser ?? false,
  };
};

/**
 * Account data, not world data, so the global `staleTime: Infinity` and the
 * persisted cache are overridden the way [[useWeeklyLeague]] overrides them: a
 * board painted from a previous visit and never revalidated would show ranks
 * that moved days ago.
 */
export const useReferrerLeaderboard = () => {
  const walletAddress = useConfigStore((s) => s.walletAddress);

  return useQuery<ReferrerLeaderboard>({
    queryKey: boardKey(walletAddress),
    queryFn: async () => {
      const response = await authFetch(`${BASE()}/leaderboard`, { method: 'GET' }, walletAddress!);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.status !== 'success') {
        throw new Error(body?.message || 'Failed to load the referrer board');
      }
      const data = body.data as Partial<ReferrerLeaderboard> | undefined;
      const rows = (data?.rows ?? []).map(toRow).filter((row): row is ReferrerLeaderboardRow => !!row);
      return { rows, me: toRow(data?.me), total: data?.total ?? rows.length };
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
};
