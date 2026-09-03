import { clientEnv } from '@/core-ui/config/clientEnv';
import { ONE_MINUTE } from '@/core-ui/config/constants';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useConfigStore } from '../stores';

export type VaultApyData = {
  /** The vault's own APY, in percent (0 when it has not accrued measurably). */
  protocolApy: number;
  /** Market behind the rate; empty when no rate came back. */
  lendingMarketName: string;
};

/**
 * The flexible position's rate, read from the DeFindex vault the funds actually
 * sit in. The API owns the lookup because it holds the DeFindex credentials.
 *
 * Deliberately not Blend's supply APY: the vault takes a fee and runs its own
 * strategy, so Blend's rate over-states what this position earns. A vault that
 * has not accrued measurably yet reports 0, and 0 is what gets shown — a number
 * the balance will actually match beats a flattering one it will not.
 */
export const useVaultApy = () => {
  const { network, token } = useConfigStore();
  const networkName = network?.networkName;
  const tokenSymbol = token?.symbol;

  return useQuery<VaultApyData>({
    queryKey: ['deposit', 'network', networkName, 'token', tokenSymbol, 'vault', 'apy'],
    queryFn: async () => {
      // Throws (instead of resolving to 0%) so a failed read is an ERROR, not a
      // successful zero: react-query then retries and `placeholderData` keeps the
      // last known rate on screen. Swallowing the error here would overwrite the
      // cached rate with 0% on every blip — worse now that we refetch on mount.
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/network/${networkName}/token/${tokenSymbol}/vault/apy`,
      );
      if (!response.ok) throw new Error(`vault apy request failed: ${response.status}`);
      const data = await response.json();
      return {
        protocolApy: data?.data?.protocolApy ?? 0,
        lendingMarketName: data?.data?.lendingMarketName ?? '',
      };
    },
    // El rate es global (no por cuenta) y se mueve durante el día: el default
    // global de 24h + refetchOnMount:false dejaba a cada dispositivo pintando lo
    // que hubiera cacheado en localStorage la última vez, y recién corregía a los
    // 5 minutos de tener la app abierta en primer plano. Resultado: la misma
    // cuenta mostraba 6,45% en desktop y 7,21% en mobile. Un minuto de staleTime
    // + revalidar al montar/enfocar/reconectar hace que el valor persistido se
    // pinte igual de rápido pero se corrija en el acto.
    staleTime: ONE_MINUTE,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: ONE_MINUTE * 5,
    // Es un número en pantalla: nunca parpadear a 0% mientras revalida.
    placeholderData: keepPreviousData,
    retry: 2,
    enabled: !!networkName && !!tokenSymbol,
  });
};
