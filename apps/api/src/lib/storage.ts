import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { logger } from './logger';

/**
 * MinIO object storage for profile avatars.
 *
 * MinIO is S3-compatible, so we talk to it with the AWS S3 SDK pointed at the
 * MinIO endpoint (path-style addressing — MinIO doesn't do virtual-hosted
 * buckets by default).
 *
 * Two URLs matter and they are usually different:
 *  - MINIO_ENDPOINT     the address the API uses to talk to MinIO. On Dokploy
 *                       this is the internal service URL (e.g. http://minio:9000).
 *  - MINIO_PUBLIC_URL   the address browsers use to GET the image. This is the
 *                       public Dokploy domain for the MinIO S3 API
 *                       (e.g. https://minio.yourdomain.com). We store
 *                       `${MINIO_PUBLIC_URL}/${bucket}/${key}` as the avatar URL.
 *
 * If MINIO_PUBLIC_URL is unset we fall back to MINIO_ENDPOINT (fine for local
 * dev where the browser can reach MinIO directly).
 */

const {
  MINIO_ENDPOINT,
  MINIO_PUBLIC_URL,
  MINIO_REGION,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
} = process.env;

const BUCKET = MINIO_BUCKET || 'avatars';
const REGION = MINIO_REGION || 'us-east-1';
const PUBLIC_BASE = (MINIO_PUBLIC_URL || MINIO_ENDPOINT || '').replace(/\/+$/, '');

export const isStorageConfigured = Boolean(
  MINIO_ENDPOINT && MINIO_ACCESS_KEY && MINIO_SECRET_KEY,
);

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!isStorageConfigured) {
    throw new Error(
      'MinIO storage is not configured: set MINIO_ENDPOINT, MINIO_ACCESS_KEY and MINIO_SECRET_KEY.',
    );
  }
  if (!client) {
    client = new S3Client({
      endpoint: MINIO_ENDPOINT as string,
      region: REGION,
      forcePathStyle: true, // MinIO addresses buckets as /bucket/key, not vhost
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY as string,
        secretAccessKey: MINIO_SECRET_KEY as string,
      },
    });
  }
  return client;
}

// Anonymous read-only policy so the stored public URLs resolve in the browser
// without signing every GET. Writes/deletes still require credentials.
const publicReadPolicy = (bucket: string) =>
  JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublicReadAvatars',
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });

let ensured = false;

/**
 * Idempotently make sure the avatars bucket exists and is publicly readable.
 * Cached after the first success so it runs at most once per process.
 */
export async function ensureBucket(): Promise<void> {
  if (ensured) return;
  const s3 = getClient();

  // Does the bucket exist? HeadBucket throws (404/NotFound) when it doesn't.
  let exists = false;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    exists = true;
  } catch (err) {
    // 409/BucketAlreadyOwnedByYou-style responses mean it exists; otherwise we
    // genuinely need to create it. Either way, fall through to CreateBucket.
    logger.info({ bucket: BUCKET, err: (err as Error)?.message }, 'avatars bucket missing — creating');
  }

  if (!exists) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      logger.info({ bucket: BUCKET }, 'Created MinIO avatars bucket');
    } catch (err) {
      const code = (err as { name?: string })?.name ?? '';
      // These two mean the bucket is already there — not a real failure.
      const benign = code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists';
      if (!benign) {
        // Real failure (wrong endpoint, bad creds, proxy 404…). Throw so the
        // upload returns a clear 500 AND we don't cache a broken "ensured"
        // state — next request retries instead of skipping creation.
        logger.error({ err, bucket: BUCKET }, 'Failed to create avatars bucket');
        throw err;
      }
    }
  }

  // Public-read policy is best-effort: objects still upload without it, they
  // just might not be anonymously readable. Don't block uploads on it.
  try {
    await s3.send(
      new PutBucketPolicyCommand({ Bucket: BUCKET, Policy: publicReadPolicy(BUCKET) }),
    );
  } catch (err) {
    logger.warn({ err, bucket: BUCKET }, 'Could not set public-read bucket policy (uploads still work)');
  }

  ensured = true;
}

export function buildPublicUrl(key: string): string {
  return `${PUBLIC_BASE}/${BUCKET}/${encodeURI(key)}`;
}

/** Upload an avatar object and return its key + public URL. */
export async function putAvatar(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<{ key: string; url: string }> {
  const send = () =>
    getClient().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

  // Happy path: the bucket already exists, so PutObject just works. We do NOT
  // probe the bucket first — some reverse proxies in front of MinIO answer
  // bucket-level requests (HEAD/PUT /bucket) with a 307/308 redirect that the
  // S3 SDK won't follow, which would break uploads even though objects PUT fine.
  // Only on a genuine "bucket missing" do we create it once and retry.
  try {
    await send();
  } catch (err) {
    if ((err as { name?: string })?.name === 'NoSuchBucket') {
      await ensureBucket();
      await send();
    } else {
      throw err;
    }
  }
  return { key: params.key, url: buildPublicUrl(params.key) };
}

/** Best-effort delete of a previously stored avatar object. */
export async function removeAvatar(key: string): Promise<void> {
  if (!key) return;
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    logger.warn({ err, key }, 'Failed to delete old avatar object (ignored)');
  }
}
