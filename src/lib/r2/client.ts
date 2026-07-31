import { S3Client } from '@aws-sdk/client-s3';

/**
 * S3 client pointed at Cloudflare R2, which is S3-compatible. Built lazily
 * and cached: reading credentials at module scope would break `next build`
 * on a machine with no secrets, exactly as the rate limiter and the auth
 * secret are lazy for the same reason.
 *
 * R2 uses a single virtual region, "auto", and an account-scoped endpoint.
 */

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function readConfig(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
        'R2_SECRET_ACCESS_KEY and R2_BUCKET.',
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

let cached: { client: S3Client; bucket: string } | undefined;

function build(): { client: S3Client; bucket: string } {
  if (cached) return cached;

  const config = readConfig();

  cached = {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
    bucket: config.bucket,
  };

  return cached;
}

export function getR2Client(): S3Client {
  return build().client;
}

export function getR2Bucket(): string {
  return build().bucket;
}
