'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { clientEnv } from '../config/clientEnv';
import { ONE_MINUTE } from '../config/constants';
import { NetworkResponseDTO } from '../types';

const transformNetworkData = (data: unknown): { networks: NetworkResponseDTO[]; types: string[] } => {
  const networks = ((data ?? []) as NetworkResponseDTO[])
    .map(({ name, tokens, type, chainId }) => ({
      name,
      type,
      chainId,
      tokens: tokens
        .filter(({ isSupported }) => isSupported)
        .map(
          ({
            name,
            decimals,
            symbol,
            isGas,
            isNative,
            isSupported,
            vaquitaContractAddress,
            contractAddress,
            contractAbi,
            lockPeriod,
            vaquitaContractAbi,
          }) => ({
            name,
            decimals,
            isGas,
            isNative,
            isSupported,
            symbol,
            vaquitaContractAddress,
            contractAddress,
            contractAbi,
            lockPeriod,
            vaquitaContractAbi,
          })
        ),
    }))
    .filter(({ tokens }) => tokens.length > 0);

  const set = new Set(networks.map((network) => network.type));
  const types = [...set];

  return { networks, types };
};

export const useNetworks = () => {
  const { data, isLoading } = useQuery<{ networks: NetworkResponseDTO[]; types: string[] }>({
    queryKey: ['network'],
    queryFn: async () => {
      const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/network`);
      const data = await response.json();
      return transformNetworkData(data.data);
    },
    refetchInterval: ONE_MINUTE * 5,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const networksData = data?.networks ?? [];
  const typesData = data?.types ?? [];

  const networksString = JSON.stringify(networksData);
  const typesString = JSON.stringify(typesData);

  const networks = useMemo(() => JSON.parse(networksString) as NetworkResponseDTO[], [networksString]);
  const types = useMemo(() => JSON.parse(typesString) as string[], [typesString]);

  return useMemo(
    () => ({
      data: {
        networks,
        types,
      },
      isLoading,
    }),
    [networks, types, isLoading]
  );
};

export const getNetworks = async (): Promise<{ networks: NetworkResponseDTO[]; types: string[] }> => {
  const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/network`);
  const data = await response.json();
  return transformNetworkData(data.data);
};
