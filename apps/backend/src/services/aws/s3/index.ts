import { AWS_S3_JUKI_FILES_PUBLIC_BUCKET } from 'config/settings';
import { FilesJukiPub } from 'types';
import { s3Bucket } from './s3';

export const s3BucketPublicFiles = s3Bucket(AWS_S3_JUKI_FILES_PUBLIC_BUCKET);

export const uploadTempPublicFile = ({ body, contentType = 'text/plain' }: {
  body: string | Buffer | Uint8Array,
  contentType?: string
}) => s3BucketPublicFiles.putObject({
  body,
  contentType,
  folder: FilesJukiPub.TEMP,
  nameDataHashed: true,
});
