'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface SavedBankAccount {
  id: string;
  label: string;
  country: string;
  currency: string;
  /** Rail de la cotización con la que se guardó; null si el proveedor no lo publicó. */
  rail: string | null;
  /** `{ [field.key]: value }`, con la forma que pidió `quote.requiredFields`. */
  fields: Record<string, string>;
  createdTimestamp: number;
  updatedTimestamp: number;
}

export interface CreateSavedBankAccountInput {
  label: string;
  country: string;
  currency: string;
  rail?: string | null;
  fields: Record<string, string>;
}

const BASE = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/wallets/saved-banks`;

const savedBankAccountsKey = (walletAddress?: string | null) => ['saved-bank-accounts', walletAddress] as const;

/**
 * Un fallo que la API explicó con un mensaje pensado para el usuario ("ya
 * tenés una cuenta con ese nombre").
 *
 * Lleva tipo propio para poder distinguirlo de todo lo demás que puede caer en
 * el mismo `catch`: un corte de red da `TypeError: Failed to fetch` y un fallo
 * nuestro da `Request failed`, dos textos en inglés que no le dicen nada a
 * nadie. Sin la marca, la pantalla no tiene forma de saber cuál mostrar.
 */
export class SavedBankApiError extends Error {}

/** Desenvuelve la respuesta `{ status, data }` de la API y tira con el mensaje del server. */
async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status !== 'success') {
    const explained = typeof body?.message === 'string' ? body.message.trim() : '';
    throw explained ? new SavedBankApiError(explained) : new Error('Request failed');
  }
  return body.data as T;
}

/**
 * Cuentas bancarias que el usuario guardó para retirar a moneda local. Mismo
 * criterio que `useSavedWallets`: son datos de cuenta, no del mundo, así que se
 * pisa el `staleTime: Infinity` global para que una cuenta cargada en otro
 * dispositivo aparezca al reabrir el flujo y no recién al recargar la app.
 */
export const useSavedBankAccounts = () => {
  const { walletAddress } = useConfigStore();

  return useQuery<SavedBankAccount[]>({
    queryKey: savedBankAccountsKey(walletAddress),
    queryFn: async () => {
      const response = await authFetch(BASE(), { method: 'GET' }, walletAddress!);
      const data = await unwrap<{ savedBankAccounts: SavedBankAccount[] }>(response);
      return data.savedBankAccounts ?? [];
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });
};

export const useCreateSavedBankAccount = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<SavedBankAccount, Error, CreateSavedBankAccountInput>({
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
      return await unwrap<SavedBankAccount>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedBankAccountsKey(walletAddress) });
    },
  });
};

export const useDeleteSavedBankAccount = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(`${BASE()}/${id}`, { method: 'DELETE' }, walletAddress);
      await unwrap<unknown>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedBankAccountsKey(walletAddress) });
    },
  });
};
