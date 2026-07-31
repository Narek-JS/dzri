import { DeleteObjectCommand } from '@aws-sdk/client-s3';

import { getR2Bucket, getR2Client } from './client';

/**
 * Deletes one object by key. Used when an item is removed, so its images do
 * not linger and keep costing storage.
 *
 * Idempotent: R2 (like S3) returns success whether or not the key existed,
 * so calling this twice, or on an object that is already gone, is not an
 * error.
 */
export async function deleteObject(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }));
}
