import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeedbackKind } from './useSubmitFeedback';

/** Orden del board: los más votados, o los más nuevos. */
export type FeedbackSort = 'top' | 'new';

export type FeedbackBoardEntry = {
  id: string;
  kind: FeedbackKind;
  title: string;
  details: string;
  status: string;
  voteCount: number;
  hasVoted: boolean;
  /** Lo mandó quien está mirando. No se puede votar el propio reporte. */
  isOwn: boolean;
  authorNickname: string | null;
  attachmentIds: string[];
  createdTimestamp: number;
};

/** URL pública de un adjunto. La sirve la API sin sesión: un `<img>` no puede
 *  mandar el header de auth, y el id es un uuid aleatorio. */
export const feedbackAttachmentUrl = (id: string) => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/feedback/attachments/${id}`;

const boardKey = (kind: FeedbackKind, sort: FeedbackSort) => ['feedback-board', kind, sort] as const;

/**
 * El board público de reportes: lo que otros usuarios mandaron, ordenado por
 * votos, para poder apoyar uno en vez de escribir el mismo bug de nuevo.
 *
 * `staleTime` corto pero no cero: el board se abre y se cierra seguido dentro de
 * la misma sesión, y no hay razón para volver a pedirlo cada vez que se cambia
 * de pestaña.
 */
export const useFeedbackBoard = (kind: FeedbackKind, sort: FeedbackSort, enabled = true) => {
  const { walletAddress } = useConfigStore();

  return useQuery<FeedbackBoardEntry[]>({
    queryKey: boardKey(kind, sort),
    enabled: enabled && Boolean(walletAddress),
    staleTime: 30_000,
    queryFn: async () => {
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/feedback/board?kind=${kind}&sort=${sort}`,
        { method: 'GET' },
        walletAddress!,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) throw new Error(body?.message ?? 'Failed to load the board');
      return (body.data.entries ?? []) as FeedbackBoardEntry[];
    },
  });
};

/**
 * Vota (o des-vota) un reporte.
 *
 * El contador se actualiza optimista sobre las dos ordenaciones cacheadas, pero
 * NO se reordena la lista: mover la tarjeta bajo el dedo justo cuando se toca es
 * la forma más rápida de que alguien vote otra cosa sin querer. El orden nuevo
 * llega en el refetch de la invalidación.
 */
export const useToggleFeedbackVote = (kind: FeedbackKind) => {
  const { walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<{ voteCount: number; hasVoted: boolean }, Error, string>({
    mutationFn: async (postId) => {
      if (!walletAddress) throw new Error('No connected wallet');

      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/feedback/${postId}/vote`,
        { method: 'POST' },
        walletAddress,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) throw new Error(body?.message ?? 'Failed to register your vote');
      return body.data as { voteCount: number; hasVoted: boolean };
    },
    onSuccess: (result, postId) => {
      for (const sort of ['top', 'new'] as const) {
        queryClient.setQueryData<FeedbackBoardEntry[]>(boardKey(kind, sort), (entries) =>
          entries?.map((e) => (e.id === postId ? { ...e, voteCount: result.voteCount, hasVoted: result.hasVoted } : e)),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['feedback-board', kind] });
    },
  });
};
