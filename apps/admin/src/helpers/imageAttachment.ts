/**
 * Prepares an image the admin picked for a release note's carousel.
 *
 * The original file is never uploaded: a screenshot off a modern phone is
 * several MB and 3000px wide, and what a user needs is to see the screen, not
 * to count pixels. It is scaled to `MAX_SIDE` on the longer edge and re-encoded
 * as JPEG, which for UI screenshots drops megabytes to tens of kilobytes with
 * nothing legible lost.
 *
 * This is a port of `apps/web/src/core-ui/helpers/imageAttachment.ts`, and the
 * resize is deliberately the ONLY processing. The web copy feeds an untrusted
 * upload that `apps/api/src/lib/imageSanitize.ts` then re-encodes server-side
 * with sharp; here the uploader is an admin behind the passcode middleware, so
 * that threat model does not apply and `sharp` stays out of this app.
 *
 * PNG becomes JPEG like everything else. Transparency does not survive, and
 * that is fine: white is painted before drawing, so a PNG with alpha does not
 * end up on the black the canvas defaults to.
 */
const MAX_SIDE = 1280;
const MAX_BYTES = 2 * 1024 * 1024;
const QUALITY_STEPS = [0.82, 0.7, 0.55];

export const ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/webp';

export type PreparedImage = {
  /** JPEG data URL, ready for an `<img src>` preview. */
  dataUrl: string;
  /** The same bytes as bare base64, which is what the API route expects. */
  base64: string;
  bytes: number;
};

/** Approximate byte size of what a base64 data URL encodes. */
const decodedSize = (base64: string): number => {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // Revoked on both paths: otherwise every failed attempt leaves a blob
    // pinned in memory until the tab reloads.
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable-image'));
    };
    img.src = url;
  });

/**
 * The rescaled, compressed image, or `null` if the file could not be read or
 * does not fit even at the lowest quality. `null` rather than an exception
 * because every caller shows the same message either way.
 */
export async function prepareImage(file: File): Promise<PreparedImage | null> {
  if (!file.type.startsWith('image/')) return null;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return null;
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bytes = decodedSize(base64);
    if (bytes <= MAX_BYTES) return { dataUrl, base64, bytes };
  }

  return null;
}
