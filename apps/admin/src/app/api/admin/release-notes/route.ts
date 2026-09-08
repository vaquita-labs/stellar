import {
  RELEASE_NOTE_BODY_MAX,
  RELEASE_NOTE_IMAGE_MAX_BYTES,
  RELEASE_NOTE_IMAGE_TYPES,
  RELEASE_NOTE_TITLE_MAX,
  RELEASE_NOTE_TRANSLATED_LANGUAGES,
  createReleaseNote,
  deleteReleaseNote,
  listReleaseNotes,
  updateReleaseNote,
} from '@vaquita/shared/services/releaseNotes/index';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSecretOk } from '@/lib/adminSecret';

// Release notes: the "what's new" popup the app shows once per user. Same
// runtime/auth conventions as the campaigns route.
export const runtime = 'nodejs';
// A note goes live the moment it is published — never cached.
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
const invalidJson = () => NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });
const badPayload = (details: unknown) =>
  NextResponse.json({ status: 'error', message: 'Invalid release note payload', details }, { status: 400 });

// Images arrive as base64 from the browser, already resized client-side by
// `prepareAttachment`. Re-checking the decoded size here is what makes the
// limit real: the uploader is trusted, but a stuck resize loop that ships a
// 12 MB original is a plain mistake, not an attack, and it would still bloat
// every `/release-notes/latest` response for every user.
const imageSchema = z.object({
  contentType: z.enum(RELEASE_NOTE_IMAGE_TYPES),
  /** Bare base64, no `data:` prefix. */
  data: z.string().min(1),
});

// A translation is both halves or it is not sent. The service drops a
// half-written pair anyway; rejecting it here is what tells the admin, instead
// of silently publishing the Spanish text to an English reader.
const translationSchema = z.object({
  title: z.string().trim().min(1).max(RELEASE_NOTE_TITLE_MAX),
  body: z.string().trim().min(1).max(RELEASE_NOTE_BODY_MAX),
});

const noteFields = {
  title: z.string().trim().min(1).max(RELEASE_NOTE_TITLE_MAX),
  body: z.string().trim().min(1).max(RELEASE_NOTE_BODY_MAX),
  /**
   * Per-language overrides; `title`/`body` above stay the fallback, so a note
   * may ship with only some languages written. `partialRecord`, not `record`:
   * a Zod 4 `record` keyed by an enum is exhaustive, and it rejected every
   * note that left one of `en`/`pt` blank with a message naming the whole
   * `translations` field rather than the missing language.
   */
  translations: z.partialRecord(z.enum(RELEASE_NOTE_TRANSLATED_LANGUAGES), translationSchema).optional(),
  published: z.boolean().optional(),
  images: z.array(imageSchema).max(8).optional(),
};

const createSchema = z.object(noteFields);
const updateSchema = z.object({ id: z.number().int().positive(), ...noteFields });

type DecodedImages =
  | { ok: true; images: { contentType: (typeof RELEASE_NOTE_IMAGE_TYPES)[number]; data: Uint8Array<ArrayBuffer> }[] }
  | { ok: false; message: string };

const decodeImages = (input: z.infer<typeof imageSchema>[]): DecodedImages => {
  const images: { contentType: (typeof RELEASE_NOTE_IMAGE_TYPES)[number]; data: Uint8Array<ArrayBuffer> }[] = [];
  for (const image of input) {
    const buffer = Buffer.from(image.data, 'base64');
    if (buffer.length === 0) return { ok: false, message: 'One of the images decoded to nothing.' };
    if (buffer.length > RELEASE_NOTE_IMAGE_MAX_BYTES) {
      return { ok: false, message: `Images must be under ${Math.round(RELEASE_NOTE_IMAGE_MAX_BYTES / 1024)} KB.` };
    }
    // A fresh Uint8Array, not the Buffer: Prisma's `Bytes` wants
    // `Uint8Array<ArrayBuffer>`, and a Buffer's backing store is a shared pool.
    images.push({ contentType: image.contentType, data: new Uint8Array(buffer) });
  }
  return { ok: true, images };
};

// GET /api/admin/release-notes — every live note, newest first, drafts included.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();
  const notes = await listReleaseNotes();
  return NextResponse.json({ data: { notes } });
}

// POST /api/admin/release-notes — create (optionally publishing straight away).
export async function POST(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badPayload(parsed.error.flatten());

  const decoded = decodeImages(parsed.data.images ?? []);
  if (!decoded.ok) return NextResponse.json({ status: 'error', message: decoded.message }, { status: 400 });

  const note = await createReleaseNote({
    title: parsed.data.title,
    body: parsed.data.body,
    translations: parsed.data.translations ?? {},
    published: parsed.data.published ?? false,
    images: decoded.images,
  });
  return NextResponse.json({ data: { note } });
}

// PATCH /api/admin/release-notes — update (id in the body). Omitting `images`
// leaves the carousel untouched; sending it replaces the whole set.
export async function PATCH(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badPayload(parsed.error.flatten());

  const { id, images, ...fields } = parsed.data;

  let decodedImages: { contentType: (typeof RELEASE_NOTE_IMAGE_TYPES)[number]; data: Uint8Array<ArrayBuffer> }[] | undefined;
  if (images) {
    const decoded = decodeImages(images);
    if (!decoded.ok) return NextResponse.json({ status: 'error', message: decoded.message }, { status: 400 });
    decodedImages = decoded.images;
  }

  const note = await updateReleaseNote(id, {
    ...fields,
    ...(decodedImages === undefined ? {} : { images: decodedImages }),
  });
  if (!note) return NextResponse.json({ status: 'error', message: 'Release note not found' }, { status: 404 });
  return NextResponse.json({ data: { note } });
}

// DELETE /api/admin/release-notes?id=123 — soft-delete. The seen-id markers on
// `profiles` keep pointing at the row, so removing a note never re-pops an
// older one for everyone who had already caught up.
export async function DELETE(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const idParam = req.nextUrl.searchParams.get('id');
  const id = Number(idParam);
  if (!idParam || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ status: 'error', message: 'Valid id query param required' }, { status: 400 });
  }

  if (!(await deleteReleaseNote(id))) {
    return NextResponse.json({ status: 'error', message: 'Release note not found' }, { status: 404 });
  }
  return NextResponse.json({ data: { id } });
}
