// Re-encodes an uploaded screenshot before it is ever stored or served.
//
// `sniffImageType` (packages/shared/src/services/feedback) reads the first
// twelve bytes and nothing else, so it cannot see what comes after the image
// data: a valid PNG header with a ZIP or a script appended passes it and then
// gets served back to every user on the board under a `image/png` header.
//
// Decoding to a pixel buffer and encoding a fresh WebP is what actually fixes
// that. Nothing but pixels survives the round trip — no trailing payload, no
// EXIF, and in particular no GPS tag, which a phone screenshot of a bug can
// carry and which the reporter has no idea they are publishing.
import sharp from 'sharp';
import { ATTACHMENT_BYTES_MAX } from '@vaquita/shared/services/feedback/index';

/** Formats we decode. Anything else is refused rather than converted. */
const ALLOWED_INPUT_FORMATS = new Set(['png', 'jpeg', 'webp']);

/**
 * Longest edge of the stored image. A screenshot only has to be readable by a
 * developer triaging it; the original resolution is not evidence of anything.
 */
const MAX_EDGE = 1600;

/**
 * Guard against a decompression bomb: a few-KB PNG can declare a 50000x50000
 * canvas, and sharp would happily allocate it. 50 MP is far above any real
 * screenshot and far below anything that hurts.
 */
const MAX_PIXELS = 50_000_000;

export type SanitizedImage = { contentType: 'image/webp'; data: Uint8Array<ArrayBuffer> };

export type SanitizeImageResult = { ok: true; value: SanitizedImage } | { ok: false; reason: string };

/**
 * Decode, normalise and re-encode `input` as WebP.
 *
 * Never throws: a corrupt or hostile file is a 400 for the reporter, not a 500
 * for us, so every sharp failure comes back as a reason string.
 */
export async function sanitizeImage(input: Uint8Array): Promise<SanitizeImageResult> {
  try {
    // `animated: false` collapses a multi-frame file to its first frame — the
    // frame count is another way to turn a small upload into a large decode.
    const image = sharp(Buffer.from(input), { limitInputPixels: MAX_PIXELS, animated: false });

    const metadata = await image.metadata();
    if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
      return { ok: false, reason: 'Attachment must be a PNG, JPEG or WebP image.' };
    }
    if (!metadata.width || !metadata.height) {
      return { ok: false, reason: 'Attachment is not a readable image.' };
    }

    const output = await image
      // Applies the EXIF orientation and then drops the tag; without it,
      // stripping the metadata would silently rotate the picture.
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // WebP at 80 is smaller than the PNG it usually comes from, so this is a
    // backstop rather than the common path — but the cap is what the column is
    // sized for and it has to hold after the re-encode too.
    if (output.length > ATTACHMENT_BYTES_MAX) {
      return { ok: false, reason: 'Attachment is too large.' };
    }

    // Copied into a plain Uint8Array for the same reason decodeAttachment does
    // it: Prisma's `Bytes` input is typed against ArrayBuffer, and a Buffer is
    // generic over ArrayBufferLike.
    const data = new Uint8Array(output.byteLength);
    data.set(output);
    return { ok: true, value: { contentType: 'image/webp', data } };
  } catch (error) {
    console.warn('[imageSanitize] failed to re-encode an attachment', error);
    return { ok: false, reason: 'Attachment could not be processed.' };
  }
}

/**
 * A small JPEG copy for the moderation request, as a `data:` URL.
 *
 * Deliberately not the stored WebP: the moderation endpoint caps images at
 * 20 MB and the request carries up to three of them, and a JPEG the model can
 * read is cheaper to ship than a faithful reproduction. Returns null on any
 * failure — the caller treats a missing image the same as a missing verdict.
 */
export async function toModerationDataUrl(input: Uint8Array): Promise<string | null> {
  try {
    const buffer = await sharp(Buffer.from(input), { limitInputPixels: MAX_PIXELS, animated: false })
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn('[imageSanitize] failed to build a moderation preview', error);
    return null;
  }
}
