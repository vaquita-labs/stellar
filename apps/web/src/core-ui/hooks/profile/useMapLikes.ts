'use client';

import { delJson, getJson, postJson } from '@/core-ui/api/http';
import { useConfigStore } from '@/core-ui/stores';
import type { LikedMapWalletsResponseDTO, MapLikeCountResponseDTO, MapLikeResponseDTO } from '@/core-ui/types';
import { type QueryKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Shared keys so the toggle mutation can patch these caches directly. */
export const likedMapWalletsKey = (
  networkName: string | undefined,
  walletAddress: string | undefined,
) => ['profile', networkName, walletAddress, 'liked-maps'] as const;

export const mapLikeCountKey = (
  networkName: string | undefined,
  walletAddress: string | undefined,
) => ['profile', networkName, walletAddress, 'map-likes'] as const;

/**
 * Lowercased wallets whose map the viewer has hearted, as a `Set` for O(1)
 * lookups. One request seeds every heart button in a feed, so their state is
 * right on first paint and survives a reload.
 *
 * Revalidates on mount because surviving a reload is the point and the global
 * client would take it too far: with every refetch trigger off, the persisted
 * snapshot is served for as long as it lives. The viewer can heart a map from
 * another device, and the toggle here only patches the caches of the device it
 * ran on.
 */
export const useLikedMapWallets = () => {
  const { network, walletAddress } = useConfigStore();

  return useQuery({
    queryKey: likedMapWalletsKey(network?.networkName, walletAddress),
    queryFn: async () => {
      const data = await getJson<LikedMapWalletsResponseDTO>(`/map-likes/wallet/${walletAddress}/liked`);
      return (data?.wallets ?? []).map((w) => w.toLowerCase());
    },
    enabled: !!network?.networkName && !!walletAddress,
    select: (wallets) => new Set(wallets),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
};

/**
 * How many hearts a profile's map has. Defaults to the connected wallet.
 *
 * The one number on this screen that OTHER people move: no mutation of the
 * owner's touches it, no realtime channel carries it, and nothing invalidates
 * this key outside the toggle. Without revalidating on mount it was frozen at
 * whatever it read the first time the profile was opened, which is the same
 * failure the invite screen had with friends joined.
 */
export const useMapLikeCount = (walletAddressOverride?: string) => {
  const { network, walletAddress: connected } = useConfigStore();
  const walletAddress = walletAddressOverride ?? connected;

  return useQuery({
    queryKey: mapLikeCountKey(network?.networkName, walletAddress),
    queryFn: () => getJson<MapLikeCountResponseDTO>(`/map-likes/wallet/${walletAddress}/count`),
    enabled: !!network?.networkName && !!walletAddress,
    select: (data) => data?.likes ?? 0,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
};

type ToggleVars = { targetWallet: string; isLiked: boolean };
type ToggleContext = {
  likedSnapshot: string[] | undefined;
  countSnapshot: MapLikeCountResponseDTO | undefined;
  countKey: QueryKey;
};

/**
 * Heart / un-heart a vaquero's map. `isLiked` is the CURRENT state, so the
 * mutation toggles it (liked → DELETE, not liked → POST). Optimistically
 * patches the viewer's liked set and the owner's count, rolls back on error and
 * reconciles on settle — same shape as `useToggleFollow`.
 */
export const useToggleMapLike = () => {
  const queryClient = useQueryClient();
  const { network, walletAddress } = useConfigStore();
  const likedKey = likedMapWalletsKey(network?.networkName, walletAddress ?? undefined);

  return useMutation<MapLikeResponseDTO | null, Error, ToggleVars, ToggleContext>({
    mutationFn: async ({ targetWallet, isLiked }) => {
      if (!walletAddress) throw new Error('No connected wallet');
      return isLiked
        ? delJson<MapLikeResponseDTO>(`/map-likes/wallet/${walletAddress}/like/${targetWallet}`)
        : postJson<MapLikeResponseDTO>(`/map-likes/wallet/${walletAddress}/like`, { targetWallet });
    },
    onMutate: async ({ targetWallet, isLiked }) => {
      const countKey = mapLikeCountKey(network?.networkName, targetWallet);
      await queryClient.cancelQueries({ queryKey: likedKey });
      await queryClient.cancelQueries({ queryKey: countKey });

      // Viewer's liked set (cache holds lowercased wallets).
      const likedSnapshot = queryClient.getQueryData<string[]>(likedKey);
      const target = targetWallet.toLowerCase();
      const base = likedSnapshot ?? [];
      queryClient.setQueryData<string[]>(
        likedKey,
        isLiked ? base.filter((w) => w !== target) : [...new Set([...base, target])],
      );

      // Owner's total, when it happens to be cached (their profile screen).
      const countSnapshot = queryClient.getQueryData<MapLikeCountResponseDTO>(countKey);
      if (countSnapshot) {
        queryClient.setQueryData<MapLikeCountResponseDTO>(countKey, {
          ...countSnapshot,
          likes: Math.max(0, countSnapshot.likes + (isLiked ? -1 : 1)),
        });
      }

      return { likedSnapshot, countSnapshot, countKey };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(likedKey, context?.likedSnapshot);
      if (context?.countKey) queryClient.setQueryData(context.countKey, context.countSnapshot);
    },
    onSettled: (_data, _err, _vars, context) => {
      void queryClient.invalidateQueries({ queryKey: likedKey });
      if (context?.countKey) void queryClient.invalidateQueries({ queryKey: context.countKey });
      // The feed rows carry their own like counts, so refresh those lists too.
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['explore'] });
    },
  });
};
