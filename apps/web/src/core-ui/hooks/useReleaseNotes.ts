'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Notas de versión: el popup de "qué hay de nuevo".
 *
 * El servidor guarda TODAS las notas pero devuelve como mucho una: la última
 * publicada, y sólo si este usuario todavía no la cerró. Acá no hay lógica de
 * "cuál toca" — `note === null` ya significa que no hay nada que mostrar.
 */

export interface ReleaseNote {
  id: number;
  title: string;
  body: string;
  publishedAt: string | null;
  imageIds: string[];
}

const BASE = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/release-notes`;

/** URL pública de una imagen del carrusel: la sirve la API, no el optimizador. */
export const releaseNoteImageUrl = (id: string) => `${BASE()}/images/${id}`;

const latestKey = (walletAddress?: string | null) => ['release-note-latest', walletAddress] as const;

async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status !== 'success') {
    throw new Error(body?.message || 'Request failed');
  }
  return body.data as T;
}

/**
 * La nota pendiente, o null.
 *
 * `staleTime: Infinity` porque publicar una nota es un evento de días, no de
 * minutos: re-preguntar en cada foco de pestaña sólo gastaría requests. Lo que
 * sí la invalida es el ack, que la deja en null localmente.
 */
export const useReleaseNote = (enabled = true) => {
  const { walletAddress } = useConfigStore();

  return useQuery<ReleaseNote | null>({
    queryKey: latestKey(walletAddress),
    queryFn: async () => {
      const response = await authFetch(`${BASE()}/latest`, { method: 'GET' }, walletAddress!);
      const data = await unwrap<{ note: ReleaseNote | null }>(response);
      return data.note ?? null;
    },
    enabled: enabled && !!walletAddress,
    staleTime: Infinity,
    retry: 1,
  });
};

/**
 * Marca la nota como vista. Se dispara al CERRAR el modal — cerrarlo es el
 * acuse, no hay botón aparte.
 *
 * El cache se pone en null antes de que viaje el request: el usuario ya cerró
 * la ventana y volver a verla aparecer porque el POST tardó sería peor que
 * perder el acuse si falla (la próxima carga la muestra de nuevo, que es
 * exactamente el comportamiento correcto cuando no se pudo registrar).
 */
export const useAckReleaseNote = () => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(`${BASE()}/${id}/ack`, { method: 'POST' }, walletAddress);
      await unwrap<{ acknowledged: boolean }>(response);
    },
    onMutate: () => {
      queryClient.setQueryData(latestKey(walletAddress), null);
    },
  });
};
