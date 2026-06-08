'use client';

import { useProfileMapObjectsByWallet } from '@/core-ui/hooks/profile/useProfileMapObjectsByWallet';
import { WorldType } from '@/core-ui/types';
import { useEffect, useState } from 'react';
import { requestMapSnapshot } from './mapSnapshot';

/**
 * Fetches a wallet's map objects (only once `enabled`) and turns them into a
 * static PNG data URL via {@link requestMapSnapshot}. Returns null until ready.
 */
export function useMapSnapshot(walletAddress: string, enabled: boolean): string | null {
  const { data } = useProfileMapObjectsByWallet(walletAddress, enabled);
  const objects = data?.objects;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !objects || objects.length === 0) return;
    return requestMapSnapshot(walletAddress, objects, WorldType.FOREST, setUrl);
  }, [enabled, objects, walletAddress]);

  return url;
}
