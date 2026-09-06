import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation } from '@tanstack/react-query';

/** Los dos tipos de reporte que acepta el backend (`feedback_posts.kind`). */
export type FeedbackKind = 'bug' | 'feedback';

export type SubmitFeedbackInput = {
  kind: FeedbackKind;
  title: string;
  details: string;
  /** Data URLs ya reescalados por `prepareAttachment`. Máximo 3, 2 MB cada uno. */
  attachments?: string[];
};

type FeedbackPostResponse = {
  id: string;
  kind: string;
  title: string;
  status: string;
  /**
   * Veredicto de moderación: 'pending' | 'approved' | 'flagged' | 'rejected'.
   * Solo 'approved' sale al board. Se lee acá porque el que manda el reporte
   * tiene que enterarse de que quedó en revisión: no verlo aparecer y no recibir
   * ningún aviso se lee como que el envío falló.
   */
  moderationStatus: string;
};

/**
 * Manda un reporte (bug o feedback) a `POST /api/v1/feedback`.
 *
 * No invalida ninguna query: el usuario no tiene una bandeja donde ver lo que
 * mandó —los reportes se triagean en el panel de admin—, así que no hay caché
 * local que refrescar.
 *
 * `appPath` sale del `location.pathname` del momento del envío, no de un
 * parámetro: es el contexto de dónde estaba parado el usuario, y pedírselo al
 * llamador sería una forma de que llegue mal. Se manda solo la ruta; el
 * servidor descarta cualquier cosa con query string o host.
 *
 * Los adjuntos viajan como data URLs dentro del mismo JSON: son tres imágenes
 * chicas y ya reescaladas, así que un segundo request de subida solo agregaría
 * la posibilidad de que el reporte quede sin su captura si el segundo falla.
 */
export const useSubmitFeedback = () => {
  const { walletAddress } = useConfigStore();

  return useMutation<FeedbackPostResponse, Error, SubmitFeedbackInput>({
    mutationFn: async ({ kind, title, details, attachments }) => {
      if (!walletAddress) throw new Error('No connected wallet');

      const appPath = typeof window !== 'undefined' ? window.location.pathname : undefined;

      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, title, details, appPath, attachments: attachments ?? [] }),
        },
        walletAddress,
      );

      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) {
        const message: string = body?.message ?? body?.error ?? `Failed to send report (${response.status})`;
        throw new Error(message);
      }

      return body.data as FeedbackPostResponse;
    },
  });
};
