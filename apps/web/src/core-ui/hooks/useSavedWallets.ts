'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface SavedWallet {
  id: string;
  label: string;
  address: string;
  /** Optional destination memo/tag; null when the wallet needs none. */
  memo: string | null;
  network: string;
  createdTimestamp: number;
  updatedTimestamp: number;
}

export interface CreateSavedWalletInput {
  label: string;
  address: string;
  memo?: string | null;
  network: string;
}

const BASE = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/wallets/saved`;

const savedWalletsKey = (walletAddress?: string | null) => ['saved-wallets', walletAddress] as const;

/** Desenvuelve la respuesta `{ status, data }` de la API y tira con el mensaje del server. */
async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status !== 'success') {
    throw new Error(body?.message || 'Request failed');
  }
  return body.data as T;
}

/**
 * Direcciones de destino que el usuario guardó para retirar. Son datos de
 * cuenta, no del mundo/juego, así que se sobrescribe el `staleTime: Infinity`
 * global: si el usuario agrega una wallet desde otro dispositivo queremos verla
 * al reabrir el flujo, no al recargar la app.
 */
export const useSavedWallets = () => {
  const { walletAddress } = useConfigStore();

  return useQuery<SavedWallet[]>({
    queryKey: savedWalletsKey(walletAddress),
    queryFn: async () => {
      const response = await authFetch(BASE(), { method: 'GET' }, walletAddress!);
      const data = await unwrap<{ savedWallets: SavedWallet[] }>(response);
      return data.savedWallets ?? [];
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });
};

export const useCreateSavedWallet = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<SavedWallet, Error, CreateSavedWalletInput>({
    mutationFn: async (input) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(
        BASE(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
        walletAddress
      );
      // POST devuelve el DTO plano, no envuelto en una key.
      return await unwrap<SavedWallet>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedWalletsKey(walletAddress) });
    },
  });
};

export const useDeleteSavedWallet = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(`${BASE()}/${id}`, { method: 'DELETE' }, walletAddress);
      await unwrap<unknown>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedWalletsKey(walletAddress) });
    },
  });
};
