'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Notas de versión: el popup de "qué hay de nuevo".
 *
 * El servidor decide las dos cosas y acá no hay lógica de "cuál toca":
 *
 * - `note` es el disparador: la última publicada, y sólo si este usuario
 *   todavía no la cerró. `note === null` ya significa que no se abre nada.
 * - `notes` son las tres últimas publicadas, haya visto lo que haya visto. Son
 *   las que se apilan adentro del popup una vez abierto, para que quien se
 *   salteó un lanzamiento igual se entere de lo que salió.
 */

/** Idiomas que una nota puede traer traducidos. El español vive en `title`/`body`. */
const TRANSLATED_LANGUAGES = ['en', 'pt'] as const;
type TranslatedLanguage = (typeof TRANSLATED_LANGUAGES)[number];

export type ReleaseNoteTranslations = Partial<Record<TranslatedLanguage, { title: string; body: string }>>;

export interface ReleaseNote {
  id: number;
  /** Español: es también el texto de respaldo de cualquier idioma sin traducir. */
  title: string;
  body: string;
  /** Puede venir vacío o faltar entero (notas anteriores a la columna). */
  translations?: ReleaseNoteTranslations;
  publishedAt: string | null;
  imageIds: string[];
}

/**
 * El texto en el idioma del lector, con respaldo al español.
 *
 * El servidor manda TODAS las traducciones y la elección se hace acá: cambiar
 * de idioma no dispara un refetch, y una nota sin traducir muestra el español
 * en vez de un popup vacío. `i18n.language` puede venir como `en-GB` o `pt-BR`,
 * así que se compara sólo la primera parte.
 */
export const resolveReleaseNoteText = (
  note: ReleaseNote,
  language: string | null | undefined,
): { title: string; body: string } => {
  const primary = (language ?? '').toLowerCase().split('-')[0];
  const translated = (TRANSLATED_LANGUAGES as readonly string[]).includes(primary)
    ? note.translations?.[primary as TranslatedLanguage]
    : undefined;
  return translated ?? { title: note.title, body: note.body };
};

const BASE = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/release-notes`;

/** URL pública de una imagen del carrusel: la sirve la API, no el optimizador. */
export const releaseNoteImageUrl = (id: string) => `${BASE()}/images/${id}`;

const latestKey = (walletAddress?: string | null) => ['release-note-latest', walletAddress] as const;

/** Lo que devuelve `GET /release-notes/latest`: el disparador y la pila. */
export interface ReleaseNoteFeed {
  /** La nota pendiente de cerrar, o null si no hay nada que abrir. */
  note: ReleaseNote | null;
  /** Las últimas tres publicadas, de la más nueva a la más vieja. */
  notes: ReleaseNote[];
}

async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status !== 'success') {
    throw new Error(body?.message || 'Request failed');
  }
  return body.data as T;
}

/**
 * El disparador y la pila, en un solo request.
 *
 * Se revalida en cada montaje, pisando el default global (`staleTime: Infinity`
 * + `refetchOnMount: false` + persistencia en localStorage). Quien publica una
 * nota es un admin: en este cliente no pasa NADA que invalide la respuesta, así
 * que con el default el `null` que se cacheó cuando todavía no había ninguna
 * quedaba fijo para siempre. Sobrevivía al reload (se rehidrata desde
 * `vaquita-rq-cache`) y también al logout —nadie limpia esa clave y el
 * `queryKey` depende de la wallet, que vuelve a ser la misma—, y ni siquiera
 * vencía: el `maxAge` del persister se mide desde el último guardado del
 * snapshot, que se refresca con cada escritura del cache. Resultado: la nota se
 * publicaba y el browser no volvía a preguntar nunca.
 *
 * El costo es un request por carga de página: `ReleaseNotesGate` vive en el
 * layout privado, que App Router conserva al navegar entre rutas.
 *
 * El ack no se ve afectado: deja la nota en null localmente, pero antes marca
 * `done`, que apaga el `enabled` — y una query apagada no revalida.
 */
export const useReleaseNote = (enabled = true) => {
  const { walletAddress } = useConfigStore();

  return useQuery<ReleaseNoteFeed>({
    queryKey: latestKey(walletAddress),
    queryFn: async () => {
      const response = await authFetch(`${BASE()}/latest`, { method: 'GET' }, walletAddress!);
      const data = await unwrap<{ note: ReleaseNote | null; notes?: ReleaseNote[] }>(response);
      return { note: data.note ?? null, notes: data.notes ?? [] };
    },
    enabled: enabled && !!walletAddress,
    staleTime: 0,
    refetchOnMount: 'always',
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
      // Sólo se apaga el disparador. `notes` queda igual: es la pila que el
      // usuario está mirando en este momento y borrarla le vaciaría el popup
      // por debajo de las manos.
      queryClient.setQueryData<ReleaseNoteFeed>(latestKey(walletAddress), (old) =>
        old ? { ...old, note: null } : { note: null, notes: [] },
      );
    },
  });
};
