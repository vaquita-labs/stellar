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
  title: string;
  body: string;
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
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  images?: { id: string }[];
};

const toDTO = (row: NoteRow): ReleaseNoteDTO => ({
  id: row.id,
  title: row.title,
  body: row.body,
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
    select: { id: true, title: true, body: true, publishedAt: true, createdAt: true, updatedAt: true, ...withImages },
  });
  return row ? toDTO(row) : null;
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
    select: { id: true, title: true, body: true, publishedAt: true, createdAt: true, updatedAt: true, ...withImages },
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
  published: boolean;
  images: ReleaseNoteImageInput[];
}): Promise<AdminReleaseNoteDTO> => {
  const row = await prisma.releaseNote.create({
    data: {
      title: input.title,
      body: input.body,
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
    select: { id: true, title: true, body: true, publishedAt: true, createdAt: true, updatedAt: true, ...withImages },
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
        ...(publishedAt === undefined ? {} : { publishedAt }),
      },
      select: { id: true, title: true, body: true, publishedAt: true, createdAt: true, updatedAt: true, ...withImages },
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
