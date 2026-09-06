import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { sanitizeImage, toModerationDataUrl } from './imageSanitize';

/** A solid-colour JPEG carrying an EXIF block, which is where GPS lives. */
const jpegWithExif = async (width = 64, height = 64) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .withExif({ IFD0: { Copyright: 'vaquita' }, IFD2: { GPSLatitudeRef: 'N' } })
    .jpeg()
    .toBuffer();

describe('sanitizeImage', () => {
  it('re-encodes a JPEG as WebP', async () => {
    const result = await sanitizeImage(await jpegWithExif());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.contentType).toBe('image/webp');
    expect((await sharp(Buffer.from(result.value.data)).metadata()).format).toBe('webp');
  });

  it('drops EXIF, and with it any GPS tag', async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await sanitizeImage(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await sharp(Buffer.from(result.value.data)).metadata()).exif).toBeUndefined();
  });

  it('downscales an oversized image to the longest-edge cap', async () => {
    const big = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: '#123456' } })
      .png()
      .toBuffer();

    const result = await sanitizeImage(big);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(Buffer.from(result.value.data)).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(800);
  });

  it('leaves a small image at its own size', async () => {
    const result = await sanitizeImage(await jpegWithExif(120, 80));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(Buffer.from(result.value.data)).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(80);
  });

  it('strips a payload appended after the image data', async () => {
    const input = await jpegWithExif();
    const polyglot = Buffer.concat([input, Buffer.from('<?php system($_GET["c"]); ?>'.repeat(64))]);

    const result = await sanitizeImage(polyglot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Buffer.from(result.value.data).includes('system($_GET')).toBe(false);
  });

  it('refuses a non-image', async () => {
    const result = await sanitizeImage(Buffer.from('this is definitely not a screenshot'));

    expect(result).toEqual({ ok: false, reason: 'Attachment could not be processed.' });
  });

  it('refuses a format outside PNG/JPEG/WebP', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();

    const result = await sanitizeImage(gif);

    expect(result).toEqual({ ok: false, reason: 'Attachment must be a PNG, JPEG or WebP image.' });
  });
});

describe('toModerationDataUrl', () => {
  it('returns a JPEG data URL the moderation endpoint can read', async () => {
    const url = await toModerationDataUrl(await jpegWithExif(2000, 2000));

    expect(url?.startsWith('data:image/jpeg;base64,')).toBe(true);
    const bytes = Buffer.from(url!.split(',')[1]!, 'base64');
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1024);
  });

  it('returns null rather than throwing on a bad input', async () => {
    expect(await toModerationDataUrl(Buffer.from('nope'))).toBeNull();
  });
});
