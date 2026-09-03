import { clientEnv } from '@/core-ui/config/clientEnv';
import { ONE_MINUTE } from '@/core-ui/config/constants';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { useConfigStore } from '../stores';

export type ApyData = {
  protocolApy: number;
  vaquitaApy: number;
  lendingMarketName: string;
  rewardPool: number;
  totalDeposits: number;
  /** Open positions currently in this term's pool — social proof, not a rate. */
  openPositions: number;
  interestModelNote?: string;
};

/**
 * Opciones de la query de APY para UN lock period. Se extraen para poder pedir
 * varios a la vez (`useApyByLockPeriods`) compartiendo exactamente la misma
 * queryKey: así la lista del portfolio y el chip del header leen del mismo
 * caché en vez de disparar dos fetch por periodo.
 */
export const apyQueryOptions = (networkName: string | undefined, tokenSymbol: string, lockPeriod: number) => ({
  queryKey: ['deposit', 'network', networkName, 'token', tokenSymbol, 'lockPeriod', lockPeriod, 'apy'],
  queryFn: async (): Promise<ApyData | null> => {
    // Tira el error en vez de resolver con ceros: un fallo tiene que ser un
    // ERROR (react-query reintenta y `placeholderData` deja el último valor en
    // pantalla), no un 0 exitoso que pisa el pozo cacheado con $0.
    const response = await fetch(
      `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/network/${networkName}/token/${tokenSymbol}/lockPeriod/${lockPeriod}/apy`
    );
    if (!response.ok) throw new Error(`apy request failed: ${response.status}`);

    const data = await response.json();

    return {
      protocolApy: data?.data?.protocolApy ?? 0,
      vaquitaApy: data?.data?.vaquitaApy ?? 0,
      lendingMarketName: data?.data?.lendingMarketName ?? '',
      rewardPool: data?.data?.rewardPool ?? 0,
      totalDeposits: data?.data?.totalDeposits ?? 0,
      openPositions: data?.data?.openPositions ?? 0,
      interestModelNote: typeof data?.data?.interestModelNote === 'string' ? data.data.interestModelNote : undefined,
    };
  },
  // Mismo motivo que en `useVaultApy`: son números compartidos (rate y pozo) que
  // se mueven durante el día, y con el staleTime global de 24h +
  // refetchOnMount:false cada dispositivo pintaba lo último que hubiera cacheado
  // en localStorage — dos teléfonos de la MISMA cuenta mostrando pozos distintos.
  staleTime: ONE_MINUTE,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchInterval: ONE_MINUTE * 5,
  // Es plata en pantalla: nunca parpadear a $0 mientras revalida.
  placeholderData: keepPreviousData,
  retry: 2,
  enabled: !!networkName && lockPeriod > 0,
});

export const useApyByLockPeriod = (lockPeriod: number, tokenSymbol: string) => {
  const { network } = useConfigStore();

  return useQuery<ApyData | null>(apyQueryOptions(network?.networkName, tokenSymbol, lockPeriod));
};

/**
 * APY de varios lock periods de una sola vez. `useApyByLockPeriod` es un hook y
 * no se puede llamar en un loop, así que la lista de allocations del portfolio
 * (una fila por plazo) usa `useQueries` con las mismas opciones por periodo.
 */
export const useApyByLockPeriods = (lockPeriods: number[], tokenSymbol: string) => {
  const { network } = useConfigStore();

  return useQueries({
    queries: lockPeriods.map((lockPeriod) => apyQueryOptions(network?.networkName, tokenSymbol, lockPeriod)),
    combine: (results) => ({
      byLockPeriod: lockPeriods.reduce<Record<number, ApyData | null>>((acc, lockPeriod, i) => {
        acc[lockPeriod] = results[i]?.data ?? null;
        return acc;
      }, {}),
      isLoading: results.some((r) => r.isLoading),
    }),
  });
};
