import { useQuery } from '@tanstack/react-query';
import { LIVE_QUERY_OPTIONS } from '../config/queryFreshness';
import { clientEnv } from '../config/clientEnv';
import { useConfigStore } from '../stores';
import { DepositResponseDTO, TotalDepositsResponseDTO } from '../types';

export const useDepositsComplete = (_walletAddress?: string) => {
  const { walletAddress: userWalletAddress, network } = useConfigStore();

  const walletAddress = _walletAddress ?? userWalletAddress;

  return useQuery<{ deposits: DepositResponseDTO[]; totals: TotalDepositsResponseDTO } | null>({
    queryKey: ['deposit', 'network', network?.networkName, 'wallet', walletAddress, 'complete'],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit/network/${network?.networkName}/wallet/${walletAddress}/complete`,
        );

        // Es plata: un 5xx tiene que fallar, no resolver vacío. `fetch` solo
        // lanza en fallo de red, así que sin este chequeo una respuesta de error
        // con body JSON pasa como éxito y `deposits` queda en [].
        if (!response.ok) throw new Error(`deposit/complete → HTTP ${response.status}`);

        const data = await response.json();

        const fetchedAtTimestamp = Date.now();
        const deposits = ((data?.data?.deposits ?? []) as DepositResponseDTO[]).map((deposit) => {
          const data: DepositResponseDTO = {
            transactionHash: deposit.transactionHash,
            amount: deposit.amount,
            tokenSymbol: deposit.tokenSymbol,
            status: deposit.status,
            state: deposit.state,
            id: deposit.id,
            vaquitaContractAddress: deposit.vaquitaContractAddress,
            vaquitaInterest: Number(deposit.vaquitaInterest),
            protocolInterest: Number(deposit.protocolInterest),
            blendInterest: Number(deposit.blendInterest),
            vaultInterest:
              deposit.vaultInterest !== undefined && deposit.vaultInterest !== null ? Number(deposit.vaultInterest) : undefined,
            depositIdHex: deposit.depositIdHex,
            // The pool re-derives the position id from the caller + this nonce,
            // so withdrawing is impossible without it.
            nonce: deposit.nonce ?? null,
            withdrawals: deposit.withdrawals || null,
            createdTimestamp: deposit.createdTimestamp || 0,
            walletAddress: deposit.walletAddress,
            updatedTimestamp: deposit.updatedTimestamp || 0,
            lockPeriod: deposit.lockPeriod || 0,
            serverTimestamp: deposit.serverTimestamp || 0,
            confirmedTimestamp: deposit.confirmedTimestamp || 0,
            inLockPeriod: deposit.inLockPeriod,
            fetchedAtTimestamp,
          };
          return data;
        });
        return {
          deposits,
          totals: data?.data?.totals,
        };
      } catch (error) {
        // Se loguea (la consola va a Ably vía useConsoleToAbly) y se relanza.
        // Devolver un portafolio vacío acá sería un éxito falso: pisaría el
        // último saldo bueno, lo persistiría a localStorage como $0 y los retries
        // de abajo nunca correrían (solo se disparan sobre errores lanzados).
        // Lanzando, react-query mantiene en pantalla el último dato bueno.
        console.error('error on useDepositsComplete', error);
        throw error;
      }
    },
    // This list is the transactions screen, so it never serves a stale page: the
    // Ably `deposits-changes` channel (see ListenDepositsChanges) only reaches a
    // tab that was open and connected at that moment, and the preset covers a
    // deposit or withdraw made anywhere else. The persisted value still paints
    // instantly on load and stays visible while `isFetching`.
    ...LIVE_QUERY_OPTIONS,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    enabled: !!network?.networkName && !!walletAddress,
  });
};
