import { HeadObjectCommand, S3ServiceException } from '@aws-sdk/client-s3';

import { getR2Bucket, getR2Client } from './client';

/**
 * Does an object exist in the bucket?
 *
 * HeadObject fetches metadata only, never the bytes, so this is the cheap
 * way to confirm a client-supplied key was actually uploaded before a
 * listing is allowed to reference it. A missing object (404 / NotFound) is a
 * normal answer and comes back as `false`.
 *
 * Anything else — a network error, denied credentials, an R2 outage — is
 * rethrown rather than swallowed. A transient failure must not be reported
 * as "the image does not exist", which would turn a blip into a wrongly
 * rejected upload.
 */
export async function headObject(key: string): Promise<boolean> {
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: getR2Bucket(), Key: key }));
    return true;
  } catch (error) {
    if (error instanceof S3ServiceException) {
      const notFound =
        error.name === 'NotFound' ||
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404;

      if (notFound) return false;
    }

    throw error;
  }
}
