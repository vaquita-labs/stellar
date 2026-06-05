'use client';

import { useQuery } from '@tanstack/react-query';
import { ReactNode, useEffect } from 'react';
import { clientEnv } from '../../config/clientEnv';
import { ONE_MINUTE } from '../../config/constants';
import { useLoading } from '@/core-ui/stores';
import { useConfigStore } from '@/core-ui/stores';
import { NetworkResponseDTO } from '../../types';
import { LoaderScreen } from './LoaderScreen';

/**
 * Shape returned by `GET /api/v1/config` (single-network `ProjectConfigResponseDTO`):
 * `networkName` + `networkPassphrase`, no `type`. The single-network config has no
 * `type`, so we derive mainnet/testnet from the passphrase (used for explorer links
 * and chain logos); everything else maps 1:1 onto `NetworkResponseDTO`.
 */
type ProjectConfigResponse = {
  networkName: string;
  networkPassphrase: string | null;
  badgesContractAddress?: string;
  tokens: NetworkResponseDTO['tokens'];
  currencies?: NetworkResponseDTO['currencies'];
  languages?: NetworkResponseDTO['languages'];
};

const transformConfig = (data: unknown): NetworkResponseDTO | null => {
  if (!data) return null;
  const config = data as ProjectConfigResponse;
  const tokens = (config.tokens ?? []).filter(({ isSupported }) => isSupported);
  if (tokens.length === 0) return null;
  const type = (config.networkPassphrase ?? '').toLowerCase().includes('public') ? 'mainnet' : 'testnet';
  return {
    networkName: config.networkName,
    type,
    networkPassphrase: config.networkPassphrase ?? null,
    ...(config.badgesContractAddress ? { badgesContractAddress: config.badgesContractAddress } : {}),
    tokens,
    currencies: config.currencies ?? [],
    languages: config.languages ?? [],
  };
};

/**
 * Single-network config provider. Replaces the former multi-network
 * NetworksProvider: it fetches the singleton project config from
 * `GET /api/v1/config` and seeds the config store once.
 */
export const ConfigProvider = ({ children }: { children: ReactNode }) => {
  const { data, isLoading } = useQuery<NetworkResponseDTO | null>({
    queryKey: ['config'],
    queryFn: async () => {
      const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/config`);
      const json = await response.json();
      return transformConfig(json.data);
    },
    refetchInterval: ONE_MINUTE * 5,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const { setNetwork, network } = useConfigStore();

  useEffect(() => {
    if (!isLoading && data) {
      setNetwork(data);
    }
  }, [isLoading, data, setNetwork]);

  useLoading('network', isLoading || !network);

  // Keep the full-screen loader up (instead of a bare orange `bg-background`)
  // while config resolves, so the boot loader stays continuous from the
  // auth-gate → config → profile phases with no flicker in between.
  if (isLoading || !network) {
    return <LoaderScreen withImage />;
  }

  return children;
};
