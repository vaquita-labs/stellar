import { useQuery } from '@tanstack/react-query';
import { clientEnv } from '../config/clientEnv';
import { LIVE_QUERY_OPTIONS } from '../config/queryFreshness';
import { useConfigStore } from '../stores';
import { DepositSummaryResponseDTO } from '../types';

export const useDeposits = (_walletAddress?: string) => {
  const { walletAddress: userWalletAddress, network } = useConfigStore();

  const walletAddress = _walletAddress ?? userWalletAddress;

  return useQuery<{ deposits: DepositSummaryResponseDTO[] } | null>({
    queryKey: ['deposit', 'network', network?.networkName, 'wallet', walletAddress],
    queryFn: async () => {
      try {
        const url = `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/network/${network?.networkName}/wallet/${walletAddress}`;
        const response = await fetch(url);

        // Es plata: un 5xx tiene que fallar, no resolver vacío. `fetch` solo
        // lanza en fallo de red, así que sin este chequeo una respuesta de error
        // con body JSON pasa como éxito y `deposits` queda en [].
        if (!response.ok) throw new Error(`deposit → HTTP ${response.status}`);

        const data = await response.json();

        const deposits = ((data?.data?.deposits ?? []) as DepositSummaryResponseDTO[]).map((deposit) => {
          const data: DepositSummaryResponseDTO = {
            amount: deposit.amount,
            state: deposit.state,
            id: deposit.id,
            tokenSymbol: deposit.tokenSymbol,
            inLockPeriod: deposit.inLockPeriod,
            lockPeriod: deposit.lockPeriod,
            vaquitaContractAddress: deposit.vaquitaContractAddress ?? '',
          };
          return data;
        });
        return {
          deposits,
        };
      } catch (error) {
        // Se loguea (la consola va a Ably vía useConsoleToAbly) y se relanza.
        // Devolver una lista vacía acá sería un éxito falso: pisaría el último
        // dato bueno, lo persistiría a localStorage y los retries de abajo nunca
        // correrían (solo se disparan sobre errores lanzados).
        console.error('useDeposits', error);
        throw error;
      }
    },
    // No polling: the Ably `deposits-changes` channel (see
    // ListenDepositsChanges) pushes the change when it happens, and this preset
    // covers the rest — a deposit made on another device, or with this tab
    // closed, shows up on the next mount, focus or reconnect.
    ...LIVE_QUERY_OPTIONS,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    enabled: !!network?.networkName && !!walletAddress,
  });
};
