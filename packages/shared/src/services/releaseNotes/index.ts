import { prisma } from '@vaquita/db';

/**
 * Release notes — the "what's new" popup.
 *
 * Every note ever published is kept, but a user only ever sees the NEWEST one.
 * That single requirement is what shapes the whole model:
 *
 * - Acknowledgement is one integer on `profiles` (`release_note_seen_id`), not
 *   a join table. A join table would record which of the older notes each user
 *   dismissed, and nothing would ever read it: the query is always "is there a
 *   published note newer than the last one you closed?".
 * - Images are `bytea` in Postgres, exactly like `feedback_attachments`. There
 *   is no object store anywhere in this repo, and a release note carries three
 *   or four resized screenshots — not a media library.
 * - `published_at IS NULL` is a draft. Admins write a note over several passes
 *   and publishing is the deliberate act that puts it in front of everyone.
 */

export const RELEASE_NOTE_TITLE_MAX = 160;
export const RELEASE_NOTE_BODY_MAX = 4000;

/**
 * The languages the app ships (`apps/web/src/core-ui/i18n`).
 *
 * `es` is not in the overrides list on purpose: the `title` / `body` columns
 * ARE the Spanish note, and they are also the fallback for every other
 * language. That is what lets a note be published with one language written —
 * an English speaker sees Spanish rather than an empty popup, which is the
 * behaviour we want while a translation is still pending.
 *
 * Spanish is the base because that is the language these notes get written in;
 * the app's own `DEFAULT_LANGUAGE` is a separate decision and is still `en`.
 */
export const RELEASE_NOTE_DEFAULT_LANGUAGE = 'es';
export const RELEASE_NOTE_TRANSLATED_LANGUAGES = ['en', 'pt'] as const;
export type ReleaseNoteLanguage = (typeof RELEASE_NOTE_TRANSLATED_LANGUAGES)[number];

export type ReleaseNoteTranslation = { title: string; body: string };
export type ReleaseNoteTranslations = Partial<Record<ReleaseNoteLanguage, ReleaseNoteTranslation>>;

const isTranslatedLanguage = (value: string): value is ReleaseNoteLanguage =>
  (RELEASE_NOTE_TRANSLATED_LANGUAGES as readonly string[]).includes(value);

/**
 * Reads the `translations` jsonb into a shape the app can trust.
 *
 * Postgres only guarantees this is an object; everything else is checked here.
 * A language we no longer ship, a half-written pair, a title that is not a
 * string — all dropped rather than repaired, because the fallback to the base
 * columns is always a correct answer and a partly-translated note is not.
 */
export const parseReleaseNoteTranslations = (value: unknown): ReleaseNoteTranslations => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const out: ReleaseNoteTranslations = {};
  for (const [language, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!isTranslatedLanguage(language)) continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;

    const { title, body } = entry as { title?: unknown; body?: unknown };
    if (typeof title !== 'string' || typeof body !== 'string') continue;
    // Both halves or neither. A translated title over a Spanish body reads as
    // a rendering bug; falling back to a consistent Spanish note does not.
    if (!title.trim() || !body.trim()) continue;

    out[language] = { title: title.trim(), body: body.trim() };
  }
  return out;
};

/**
 * The note's text in the reader's language, falling back to the base columns.
 *
 * `language` is whatever the client has — `'en-GB'`, `'pt-BR'`, `undefined` —
 * so only the primary subtag is matched. A regional variant we do not carry
 * still gets its language rather than the Spanish base.
 */
export const resolveReleaseNoteText = (
  note: { title: string; body: string; translations?: ReleaseNoteTranslations },
  language: string | null | undefined,
): ReleaseNoteTranslation => {
  const primary = (language ?? '').toLowerCase().split('-')[0];
  const translated = primary && isTranslatedLanguage(primary) ? note.translations?.[primary] : undefined;
  return translated ?? { title: note.title, body: note.body };
};

/** Mirrors the CHECK on `release_note_images.content_type`. */
export const RELEASE_NOTE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ReleaseNoteImageType = (typeof RELEASE_NOTE_IMAGE_TYPES)[number];

/** Mirrors the CHECK on `release_note_images.byte_size`. */
export const RELEASE_NOTE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const isReleaseNoteImageType = (value: unknown): value is ReleaseNoteImageType =>
  typeof value === 'string' && (RELEASE_NOTE_IMAGE_TYPES as readonly string[]).includes(value);

/** What the app shows a user. Ids only for the images — the bytes are a separate GET. */
export type ReleaseNoteDTO = {
  id: number;
  /** The base/Spanish text, and the fallback for any untranslated language. */
  title: string;
  body: string;
  /**
   * Sent in full rather than resolved server-side: the client already knows the
   * reader's language, the whole payload is a few kilobytes of text, and a
   * language switch then needs no refetch.
   */
  translations: ReleaseNoteTranslations;
  publishedAt: string | null;
  imageIds: string[];
};

/** What the admin screen edits, drafts included. */
export type AdminReleaseNoteDTO = ReleaseNoteDTO & {
  createdAt: string;
  updatedAt: string;
};

type NoteRow = {
  id: number;
  title: string;
  body: string;
  translations: unknown;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  images?: { id: string }[];
};

const toDTO = (row: NoteRow): ReleaseNoteDTO => ({
  id: row.id,
  title: row.title,
  body: row.body,
  translations: parseReleaseNoteTranslations(row.translations),
  publishedAt: row.publishedAt?.toISOString() ?? null,
  imageIds: (row.images ?? []).map((image) => image.id),
});

const toAdminDTO = (row: NoteRow): AdminReleaseNoteDTO => ({
  ...toDTO(row),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const withImages = {
  images: {
    select: { id: true },
    orderBy: [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
};

/**
 * The newest published note, or null.
 *
 * Ordered by `publishedAt` and not by `id`: a note drafted last week and
 * published today is the newest one there is, and ordering by id would keep
 * showing the older note that happened to be published after it.
 */
export const getLatestReleaseNote = async (): Promise<ReleaseNoteDTO | null> => {
  const row = await prisma.releaseNote.findFirst({
    where: { deletedAt: null, publishedAt: { not: null } },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, title: true, body: true, translations: true, publishedAt: true, createdAt: true, updatedAt: true, ...withImages },
  });
  return row ? toDTO(row) : null;
};

/**
 * The newest published notes, newest first.
 *
 * Same filter and same ordering as `getLatestReleaseNote` — this is that query
 * without the `take: 1`. Deliberately not `listReleaseNotes`, which is the admin
 * listing and includes drafts.
 *
 * What the app does with these is show the last few stacked behind the one that
 * triggered the popup, so someone who skipped a launch still finds out what
 * shipped. They are returned regardless of what the profile has acknowledged:
 * the marker decides whether the popup OPENS, not what it contains.
 */
export const getRecentReleaseNotes = async (limit = 3): Promise<ReleaseNoteDTO[]> => {
  const rows = await prisma.releaseNote.findMany({
    where: { deletedAt: null, publishedAt: { not: null } },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { id: true, title: true, body: true, translations: true, publishedAt: true, createdAt: true, updatedAt: true, ...withImages },
  });
  return rows.map(toDTO);
};

/**
 * The note this profile still has to see, if any.
 *
 * A profile that has never acknowledged anything (`seenId` null) IS shown the
 * current note — someone installing the app today should learn what shipped
 * last week, and there is exactly one popup either way.
 */
export const getUnseenReleaseNote = async (profileId: number | null): Promise<ReleaseNoteDTO | null> => {
  const latest = await getLatestReleaseNote();
  if (!latest) return null;
  if (profileId === null) return latest;

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { releaseNoteSeenId: true },
  });
  const seenId = profile?.releaseNoteSeenId ?? null;
  return seenId !== null && seenId >= latest.id ? null : latest;
};

/**
 * Records that the profile closed the modal for `noteId`.
 *
 * Never moves the marker backwards. Two tabs can ack in either order, and a
 * stale one winning would pop the modal again on the next load.
 */
export const acknowledgeReleaseNote = async (profileId: number, noteId: number): Promise<void> => {
  await prisma.profile.updateMany({
    where: {
      id: profileId,
      OR: [{ releaseNoteSeenId: null }, { releaseNoteSeenId: { lt: noteId } }],
    },
    data: { releaseNoteSeenId: noteId },
  });
};

/** One image's bytes. Only served for a note that is actually published. */
export const getReleaseNoteImage = async (
  id: string,
): Promise<{ contentType: string; data: Buffer } | null> => {
  const row = await prisma.releaseNoteImage.findFirst({
    where: { id, releaseNote: { deletedAt: null, publishedAt: { not: null } } },
    select: { contentType: true, data: true },
  });
  if (!row) return null;
  return { contentType: row.contentType, data: Buffer.from(row.data) };
};

/** The same bytes with no visibility filter, so an admin can preview a draft. */
export const getReleaseNoteImageForReview = async (
  id: string,
): Promise<{ contentType: string; data: Buffer } | null> => {
  const row = await prisma.releaseNoteImage.findUnique({
    where: { id },
    select: { contentType: true, data: true },
  });
  if (!row) return null;
  return { contentType: row.contentType, data: Buffer.from(row.data) };
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const listReleaseNotes = async (limit = 50): Promise<AdminReleaseNoteDTO[]> => {
  const rows = await prisma.releaseNote.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'desc' },
    take: limit,
    select: { id: true, title: true, body: true, translations: true, publishedAt: true, createdAt: true, updatedAt: true, ...withImages },
  });
  return rows.map(toAdminDTO);
};

export type ReleaseNoteImageInput = {
  contentType: ReleaseNoteImageType;
  /** `Uint8Array<ArrayBuffer>`, not `Buffer`: what Prisma's `Bytes` accepts. */
  data: Uint8Array<ArrayBuffer>;
};

export const createReleaseNote = async (input: {
  title: string;
  body: string;
  translations?: ReleaseNoteTranslations;
  published: boolean;
  images: ReleaseNoteImageInput[];
}): Promise<AdminReleaseNoteDTO> => {
  const row = await prisma.releaseNote.create({
    data: {
      title: input.title,
      body: input.body,
      // Sanitised on the way IN as well as out, so a half-written pair never
      // reaches the column and the admin list shows the same languages the app
      // will actually use.
      translations: parseReleaseNoteTranslations(input.translations ?? {}),
      publishedAt: input.published ? new Date() : null,
      images: {
        create: input.images.map((image, index) => ({
          contentType: image.contentType,
          byteSize: image.data.length,
          data: image.data,
          displayOrder: index,
        })),
      },
    },
    select: { id: true, title: true, body: true, translations: true, publishedAt: true, createdAt: true, updatedAt: true, ...withImages },
  });
  return toAdminDTO(row);
};

/**
 * Edits a note.
 *
 * `images` is all-or-nothing: passing it REPLACES the carousel, omitting it
 * leaves it alone. A partial merge would need stable client-side ids for
 * pictures the admin never touched, and the editor re-uploads the set it has.
 *
 * Publishing stamps `publishedAt` only the first time. Re-publishing an already
 * published note must not move it back to the top of everyone's feed — that
 * would re-pop the modal for every user who already closed it, which is exactly
 * the bug the seen-id marker exists to prevent.
 */
export const updateReleaseNote = async (
  id: number,
  input: {
    title?: string;
    body?: string;
    /** All-or-nothing, like `images`: sending it replaces the whole set. */
    translations?: ReleaseNoteTranslations;
    published?: boolean;
    images?: ReleaseNoteImageInput[];
  },
): Promise<AdminReleaseNoteDTO | null> => {
  const existing = await prisma.releaseNote.findFirst({
    where: { id, deletedAt: null },
    select: { publishedAt: true },
  });
  if (!existing) return null;

  const publishedAt =
    input.published === undefined
      ? undefined
      : input.published
        ? (existing.publishedAt ?? new Date())
        : null;

  const row = await prisma.$transaction(async (tx) => {
    if (input.images) {
      await tx.releaseNoteImage.deleteMany({ where: { releaseNoteId: id } });
      await tx.releaseNoteImage.createMany({
        data: input.images.map((image, index) => ({
          releaseNoteId: id,
          contentType: image.contentType,
          byteSize: image.data.length,
          data: image.data,
          displayOrder: index,
        })),
      });
    }
    return tx.releaseNote.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.translations === undefined
          ? {}
          : { translations: parseReleaseNoteTranslations(input.translations) }),
        ...(publishedAt === undefined ? {} : { publishedAt }),
      },
      select: { id: true, title: true, body: true, translations: true, publishedAt: true, createdAt: true, updatedAt: true, ...withImages },
    });
  });

  return toAdminDTO(row);
};

/**
 * Soft delete. The row stays because "we keep every note" is the requirement,
 * and because a hard delete would cascade the images away with it — leaving a
 * user who has the modal open staring at broken pictures.
 */
export const deleteReleaseNote = async (id: number): Promise<boolean> => {
  const result = await prisma.releaseNote.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
};
