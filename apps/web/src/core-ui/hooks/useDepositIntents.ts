'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import type { DepositIntentDTO } from '@/core-ui/types';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const BASE = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/deposit-intents`;

/** Cada cuánto se pregunta por una espera abierta, por si el servidor la cerró. */
const OPEN_INTENT_POLL_MS = 20_000;

const openIntentKey = (walletAddress?: string | null) => ['deposit-intents', 'open', walletAddress] as const;

/** Desenvuelve la respuesta `{ status, data }` de la API. */
async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status !== 'success') {
    throw new Error(typeof body?.message === 'string' && body.message ? body.message : 'Request failed');
  }
  return body.data as T;
}

/**
 * El depósito "desde otra app" que el usuario dejó esperando, o `null`.
 *
 * Vive en la base y no en el navegador para que la tarjeta de espera del home
 * sobreviva a una recarga y aparezca en el otro dispositivo: el usuario sale a
 * Binance a mandar la plata y vuelve cuando sea. Es sólo una marca de UI —nunca
 * acredita nada—, así que un 'arrived' reportado por el cliente alcanza.
 *
 * El servidor también la cierra solo cuando Horizon muestra el USDC entrando
 * (al leerla y con un vigilante cada minuto), y ahí avisa con notificación y
 * push. Por eso, mientras hay una espera abierta, se vuelve a preguntar cada
 * 20 s: la tarjeta se va aunque la plata haya entrado con la app cerrada o
 * mientras la tarjeta estaba desmontada.
 */
export const useOpenDepositIntent = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useQuery<DepositIntentDTO | null>({
    queryKey: openIntentKey(walletAddress),
    queryFn: async () => {
      const previous = queryClient.getQueryData<DepositIntentDTO | null>(openIntentKey(walletAddress));
      const response = await authFetch(`${BASE()}/open`, { method: 'GET' }, walletAddress!);
      const data = await unwrap<{ intent: DepositIntentDTO | null }>(response);
      const intent = data.intent ?? null;
      // Si el servidor la cerró, probablemente acaba de crear la notificación
      // "llegó tu depósito": que la campana no espere al mensaje de Ably.
      if (previous && !intent) void queryClient.invalidateQueries({ queryKey: ['notifications', walletAddress] });
      return intent;
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: (query) => (query.state.data ? OPEN_INTENT_POLL_MS : false),
    refetchIntervalInBackground: false,
  });
};

/** Abre (o reutiliza) la espera para una plataforma del catálogo. */
export const useOpenDepositIntentMutation = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<DepositIntentDTO, Error, string>({
    mutationFn: async (platformId) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(
        BASE(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platformId }),
        },
        walletAddress,
      );
      // POST devuelve el DTO plano, no envuelto en una key.
      return await unwrap<DepositIntentDTO>(response);
    },
    onSuccess: (intent) => {
      queryClient.setQueryData(openIntentKey(walletAddress), intent);
    },
  });
};

/**
 * Cierra la espera: 'arrived' cuando el saldo subió, 'cancel' cuando el usuario
 * la descarta. Un 404 (ya estaba cerrada, por ejemplo desde el otro
 * dispositivo) no es un error que valga mostrar: la tarjeta igual se va.
 */
export const useCloseDepositIntent = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; action: 'arrived' | 'cancel' }>({
    mutationFn: async ({ id, action }) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(`${BASE()}/${id}/${action}`, { method: 'POST' }, walletAddress);
      if (response.status === 404) return;
      await unwrap<unknown>(response);
    },
    onSettled: () => {
      queryClient.setQueryData(openIntentKey(walletAddress), null);
      void queryClient.invalidateQueries({ queryKey: openIntentKey(walletAddress) });
    },
  });
};
