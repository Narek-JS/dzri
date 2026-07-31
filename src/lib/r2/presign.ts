import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getR2Bucket, getR2Client } from './client';
import { generateObjectKey } from './objectKey';
import { publicUrl } from './publicUrl';

/**
 * Presigned PUT lifetime. Long enough to upload 8 MB on a slow phone
 * connection, short enough that a URL that leaks out of the client is
 * already stale.
 */
export const PRESIGN_TTL_SECONDS = 5 * 60;

export type PresignUploadInput = {
  userId: string;
  contentType: string;
  contentLength: number;
};

export type PresignedUpload = {
  /** The R2 URL to PUT the bytes to. Expires in PRESIGN_TTL_SECONDS. */
  uploadUrl: string;
  /** The object key, stored later on whatever item references the image. */
  key: string;
  /** Where the object will be readable from once uploaded. */
  publicUrl: string;
};

/**
 * Signs a single-object PUT that the browser uploads straight to R2, so the
 * file bytes never pass through the server — a proxy would burn Vercel
 * bandwidth and hit the serverless body-size limit (DECISIONS.md).
 *
 * `ContentType` and `ContentLength` are set on the command, which folds
 * them into the signature: R2 rejects the upload if the client then sends a
 * different MIME type or a different byte count than it declared here. The
 * key is generated server-side from the user id and is never accepted from
 * the caller.
 */
export async function presignUpload(input: PresignUploadInput): Promise<PresignedUpload> {
  const key = generateObjectKey(input.userId, input.contentType);

  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  });

  const uploadUrl = await getSignedUrl(getR2Client(), command, {
    expiresIn: PRESIGN_TTL_SECONDS,
    // Force both into the signed set rather than trusting the SDK's default
    // hoisting — this is the whole point of the endpoint, so it must not
    // depend on a default that a version bump could change.
    signableHeaders: new Set(['content-type', 'content-length']),
  });

  return { uploadUrl, key, publicUrl: publicUrl(key) };
}
