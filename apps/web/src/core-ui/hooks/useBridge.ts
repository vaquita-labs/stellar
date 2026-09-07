'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Puente de USDC entre Base y Stellar, liquidado por NEAR Intents 1Click.
 *
 * El servidor es el único que habla con 1Click: acá no hay wallet de EVM ni
 * firma de nada. Para traer USDC, 1Click devuelve una dirección `0x…` y el
 * usuario la fondea desde el exchange o la wallet que ya usa; para sacarlo,
 * devuelve una `G…` con memo y se paga con un pago clásico patrocinado.
 */

export type BridgeDirection = 'evm_to_stellar' | 'stellar_to_evm';

export interface BridgeQuote {
  amountIn: string;
  amountOut: string;
  minAmountOut: string | null;
  withdrawFee: number | null;
  /** Segundos, estimación de 1Click. */
  timeEstimate: number | null;
  deadline: string | null;
}

export interface BridgeTransfer {
  id: string;
  direction: BridgeDirection;
  sourceNetwork: string;
  destinationNetwork: string;
  sourceWallet: string;
  destinationWallet: string;
  amount: string;
  amountRaw: string;
  amountOut: string | null;
  status: string;
  depositAddress: string | null;
  /** Sólo con origen Stellar: sin él el depósito llega sin dueño. */
  depositMemo: string | null;
  deadline: number | null;
  sourceTxHash: string | null;
  destinationTxHash: string | null;
  errorReason: string | null;
  createdTimestamp: number;
  updatedTimestamp: number;
}

export interface BridgeQuoteInput {
  direction: BridgeDirection;
  amount: string;
  evmWallet: string;
}

/** Estados de 1Click que ya no cambian más: nada que seguir consultando. */
const TERMINAL = ['SUCCESS', 'REFUNDED', 'FAILED'];

export const isBridgeTerminal = (status: string) => TERMINAL.includes(status);

const BASE = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/bridge`;

const transfersKey = (walletAddress?: string | null) => ['bridge-transfers', walletAddress] as const;
const transferKey = (id: string) => ['bridge-transfer', id] as const;

/** Desenvuelve `{ status, data }` y tira con el mensaje del server. */
async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status !== 'success') {
    throw new Error(body?.message || 'Request failed');
  }
  return body.data as T;
}

/**
 * Cotización en seco para la pantalla de monto. No emite dirección de depósito,
 * así que se puede pedir todas las veces que haga falta sin dejar filas atrás.
 */
export const useBridgeQuote = () => {
  const { walletAddress } = useConfigStore();

  return useMutation<BridgeQuote, Error, BridgeQuoteInput>({
    mutationFn: async (input) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(
        `${BASE()}/quote`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
        walletAddress,
      );
      return await unwrap<BridgeQuote>(response);
    },
  });
};

/** Cotización en firme + la fila que la sigue. Devuelve ya la dirección de depósito. */
export const useCreateBridgeTransfer = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<BridgeTransfer, Error, BridgeQuoteInput>({
    mutationFn: async (input) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(
        `${BASE()}/transfers`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
        walletAddress,
      );
      return await unwrap<BridgeTransfer>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: transfersKey(walletAddress) });
    },
  });
};

/**
 * Sigue una transferencia hasta que termina.
 *
 * El servidor consulta 1Click en cada lectura, así que el intervalo de acá es
 * el que define cada cuánto se refresca de verdad. 5 s contra los 27-50 s que
 * tarda un swap: se ve moverse sin castigar la API. Al llegar a un estado
 * terminal deja de pedir solo.
 */
export const useBridgeTransfer = (id: string | null) => {
  const { walletAddress } = useConfigStore();

  return useQuery<BridgeTransfer>({
    queryKey: transferKey(id ?? ''),
    queryFn: async () => {
      const response = await authFetch(`${BASE()}/transfers/${id}`, { method: 'GET' }, walletAddress!);
      return await unwrap<BridgeTransfer>(response);
    },
    enabled: !!id && !!walletAddress,
    refetchInterval: (query) => (isBridgeTerminal(query.state.data?.status ?? '') ? false : 5_000),
    staleTime: 0,
  });
};

/** Últimas transferencias del usuario, con el estado ya refrescado por el server. */
export const useBridgeTransfers = (enabled = true) => {
  const { walletAddress } = useConfigStore();

  return useQuery<BridgeTransfer[]>({
    queryKey: transfersKey(walletAddress),
    queryFn: async () => {
      const response = await authFetch(`${BASE()}/transfers`, { method: 'GET' }, walletAddress!);
      const data = await unwrap<{ transfers: BridgeTransfer[] }>(response);
      return data.transfers ?? [];
    },
    enabled: enabled && !!walletAddress,
    staleTime: 15_000,
  });
};

/**
 * Le dice a 1Click qué pago fondeó la dirección de depósito (pata de salida).
 * Acelera el match del memo; si falla, el hash igual queda guardado.
 */
export const useAttachDepositTx = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<BridgeTransfer, Error, { id: string; txHash: string }>({
    mutationFn: async ({ id, txHash }) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(
        `${BASE()}/transfers/${id}/deposit-tx`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash }) },
        walletAddress,
      );
      return await unwrap<BridgeTransfer>(response);
    },
    onSuccess: (transfer) => {
      queryClient.setQueryData(transferKey(transfer.id), transfer);
      void queryClient.invalidateQueries({ queryKey: transfersKey(walletAddress) });
    },
  });
};
