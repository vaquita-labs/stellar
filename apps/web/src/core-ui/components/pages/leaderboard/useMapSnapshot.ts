'use client';

import { useProfileMapObjectsByWallet } from '@/core-ui/hooks/profile/useProfileMapObjectsByWallet';
import { WorldType } from '@/core-ui/types';
import { useEffect, useState } from 'react';
import { requestMapSnapshot } from './mapSnapshot';

/**
 * Fetches a wallet's map objects (only once `enabled`) and turns them into a
 * static PNG via {@link requestMapSnapshot}. Returns null until ready.
 *
 * The snapshot arrives as a Blob shared through the module's cache, and the URL
 * built here belongs to this hook alone: it is released on unmount, so the bytes
 * live exactly as long as something is showing them.
 */
export function useMapSnapshot(walletAddress: string, enabled: boolean): string | null {
  const { data } = useProfileMapObjectsByWallet(walletAddress, enabled);
  const objects = data?.objects;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !objects || objects.length === 0) return;

    let objectUrl: string | null = null;
    const cancel = requestMapSnapshot(walletAddress, objects, WorldType.FOREST, (image) => {
      objectUrl = URL.createObjectURL(image);
      setUrl(objectUrl);
    });

    return () => {
      cancel();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [enabled, objects, walletAddress]);

  return url;
}
