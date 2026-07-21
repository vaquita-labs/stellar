'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import {
  COHORT_SIZE,
  Division,
  LeagueWeek,
  divisionForXp,
  leagueWeekAt,
} from '@/core-ui/components/pages/leaderboard/leagues';
import { useConfigStore } from '@/core-ui/stores';
import { LeaderboardResponseDTO } from '@/core-ui/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { resolveAvatarConfig, type AvatarConfig } from '@vaquita/avatar';
import { ONE_MINUTE } from '../config/constants';

/** One player inside a weekly cohort. Ranks are cohort-local: rank 1 is the
 *  best of *these* ~30 people, not of the whole app. */
export interface LeagueMemberDTO {
  rank: number;
  walletAddress: string;
  nickname: string;
  avatarConfig: AvatarConfig;
  /** XP earned inside the current league week — the only number the board shows. */
  weeklyXp: number;
  isCurrentUser: boolean;
}

export interface WeeklyLeagueDTO {
  week: LeagueWeek;
  division: Division;
  members: LeagueMemberDTO[];
  /** The viewer's own row, or null when they aren't in a cohort yet. */
  me: LeagueMemberDTO | null;
}

export const weeklyLeagueQueryKey = (
  networkName: string | undefined,
  weekId: string,
  viewerWallet: string,
) => ['weekly-league', 'network', networkName, weekId, viewerWallet] as const;

/**
 * Weekly league board.
 *
 * BACKEND TODO: this is the frontend half of the feature. Today it derives the
 * cohort from `GET /api/v1/leaderboard` (the all-time cycle board) and treats
 * each row's `experience` as its weekly XP. What the API still owes us:
 *
 *   1. `GET /api/v1/leaderboard/weekly` returning the viewer's *cohort* — up to
 *      COHORT_SIZE players bucketed into the same division, not the global top.
 *   2. XP scoped to the league week (Monday 00:00 UTC → Monday 00:00 UTC), so
 *      the board actually resets every week.
 *   3. A persisted division per profile, with promotion/demotion applied at the
 *      week rollover, replacing `divisionForXp` below.
 *
 * Until then the shape returned here is exactly the shape the API should ship,
 * so swapping the source is a change to `queryFn` alone.
 */
export const useWeeklyLeague = () => {
  const { network, walletAddress } = useConfigStore();
  const viewerWallet = walletAddress ?? '';
  // Pinned per render-pass, not per render: the week id is part of the query
  // key, and re-reading the clock on every render would churn it at midnight.
  const week = useMemo(() => leagueWeekAt(Date.now()), []);

  const query = useQuery({
    queryKey: weeklyLeagueQueryKey(network?.networkName, week.id, viewerWallet),
    enabled: !!network?.networkName,
    queryFn: async (): Promise<{ rows: LeaderboardResponseDTO[]; me: LeaderboardResponseDTO | null }> => {
      const url = new URL(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/leaderboard`);
      url.searchParams.set('cycle', 'current');
      url.searchParams.set('limit', String(COHORT_SIZE));
      url.searchParams.set('offset', '0');
      if (viewerWallet) url.searchParams.set('me', viewerWallet);

      const response = await fetch(url);
      const body = await response.json();
      const page = body?.data;
      return { rows: page?.rows ?? [], me: page?.me ?? null };
    },
    // The board is a shared, slow-moving object; a refetch every few minutes
    // keeps it live without hammering the API from every open tab.
    refetchInterval: ONE_MINUTE * 5,
    refetchOnWindowFocus: true,
    // Overrides the global `staleTime: Infinity` + localStorage persistence.
    // Without this the page paints whatever was cached on a previous visit and
    // never revalidates on mount — which is how a row could still show an
    // avatar (or an XP total) the profile had already changed.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const data = useMemo<WeeklyLeagueDTO | null>(() => {
    if (!query.data) return null;
    const { rows, me } = query.data;

    // The viewer's own XP decides which division they're looking at. Falling
    // back to the leader keeps the header meaningful for a signed-out visitor.
    const myXp = me?.experience ?? rows[0]?.experience ?? 0;
    const division = divisionForXp(myXp);

    const seen = new Set<string>();
    const pool = [...rows];
    // The API only guarantees `me` is in the page when the viewer ranks high
    // enough; append them so nobody is missing from their own board.
    if (me && !rows.some((r) => r.walletAddress === me.walletAddress)) pool.push(me);

    const members = pool
      .filter((row) => {
        const key = (row.walletAddress ?? '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      // TODO(backend): `experience` is lifetime XP today, so the order matches
      // the all-time board. It becomes a true weekly reset once the API scopes
      // it to `week`.
      .sort((a, b) => (b.experience ?? 0) - (a.experience ?? 0))
      .slice(0, COHORT_SIZE)
      .map((row, i) => ({
        rank: i + 1,
        walletAddress: row.walletAddress ?? '',
        nickname: (row.nickname ?? '').trim(),
        avatarConfig: resolveAvatarConfig(row.avatarConfig, row.walletAddress ?? ''),
        weeklyXp: Math.max(0, Math.floor(row.experience ?? 0)),
        isCurrentUser:
          !!viewerWallet &&
          (row.walletAddress ?? '').toLowerCase() === viewerWallet.toLowerCase(),
      }));

    return {
      week,
      division,
      members,
      me: members.find((m) => m.isCurrentUser) ?? null,
    };
  }, [query.data, viewerWallet, week]);

  return { ...query, league: data };
};
