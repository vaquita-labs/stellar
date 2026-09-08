import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

/** The languages a note can be translated into. `es` lives in `title`/`body`. */
export const NOTE_LANGUAGES = ['en', 'pt'] as const;
export type NoteLanguage = (typeof NOTE_LANGUAGES)[number];

/** The language the base columns hold — the one a note cannot be saved without. */
export const NOTE_BASE_LANGUAGE = 'es' as const;

export type ReleaseNoteTranslation = { title: string; body: string };
export type ReleaseNoteTranslations = Partial<Record<NoteLanguage, ReleaseNoteTranslation>>;

/**
 * A `release_notes` row as the admin API route returns it. Dates are ISO
 * strings; the images are ids only — the bytes come from the preview route.
 */
export interface ReleaseNote {
  id: number;
  /** Spanish, and the fallback shown to any language without a translation. */
  title: string;
  body: string;
  translations: ReleaseNoteTranslations;
  /** null = draft. Only a published note is ever shown in the app. */
  publishedAt: string | null;
  imageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseNoteImagePayload {
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Bare base64, no `data:` prefix. */
  data: string;
}

export interface ReleaseNoteCreatePayload {
  title: string;
  body: string;
  /** All-or-nothing, like `images`: sending it replaces the whole set. */
  translations?: ReleaseNoteTranslations;
  published?: boolean;
  /**
   * Omitting this on an update leaves the carousel alone; sending it replaces
   * the whole set. There is no per-image edit — the editor holds the set it
   * uploaded and re-sends it.
   */
  images?: ReleaseNoteImagePayload[];
}

export interface ReleaseNoteUpdatePayload extends ReleaseNoteCreatePayload {
  id: number;
}

// Same-origin route handler inside this admin app.
const NOTES_URL = '/api/admin/release-notes';

/** Preview bytes for a draft's image. Behind the passcode cookie, not the header. */
export const releaseNoteImageUrl = (id: string) => `${NOTES_URL}/images/${id}`;

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

/** Read every live note, drafts included, newest first. */
export const useReleaseNotes = () =>
  useQuery<ReleaseNote[]>({
    queryKey: ['admin', 'release-notes'],
    queryFn: async () => {
      const response = await fetch(NOTES_URL, { headers: adminHeaders() });
      const data = await response.json();
      return (data?.data?.notes ?? []) as ReleaseNote[];
    },
  });

const parseError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {
    /* ignore */
  }
  return fallback;
};

export const createReleaseNote = async (payload: ReleaseNoteCreatePayload): Promise<ReleaseNote> => {
  const response = await fetch(NOTES_URL, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to create release note'));
  const data = await response.json();
  return data?.data?.note as ReleaseNote;
};

export const updateReleaseNote = async (payload: ReleaseNoteUpdatePayload): Promise<ReleaseNote> => {
  const response = await fetch(NOTES_URL, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to update release note'));
  const data = await response.json();
  return data?.data?.note as ReleaseNote;
};

/** Soft-delete: the seen-id markers on profiles keep pointing at the row. */
export const deleteReleaseNote = async (id: number): Promise<void> => {
  const response = await fetch(`${NOTES_URL}?id=${id}`, { method: 'DELETE', headers: adminHeaders() });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to delete release note'));
};
