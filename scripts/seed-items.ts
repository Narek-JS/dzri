import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { encode } from 'blurhash';
import { and, eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';

import { db } from '@/db';
import { categories, districts, itemImages, items, users } from '@/db/schema';
import type { ItemCondition } from '@/db/schema';
import {
  BLURHASH_SAMPLE_EDGE,
  ORIGINAL_LONGEST_EDGE,
  THUMB_LONGEST_EDGE,
  blurhashComponents,
  scaleToFit,
} from '@/lib/images/dimensions';
import { THUMB_MAX_BYTES, THUMB_QUALITY_STEPS, encodeUnderCap } from '@/lib/images/thumbQuality';
import { normalizeArmenianPhone } from '@/lib/phone';
import { getR2Bucket, getR2Client } from '@/lib/r2/client';
import { generateObjectKey } from '@/lib/r2/objectKey';
import { publicUrl } from '@/lib/r2/publicUrl';

import friends from './seed-data/friends.json';

/**
 * One-time pre-launch seed: uploads each friend's item photos to R2 and
 * inserts the items straight to `active`, bypassing moderation — these are
 * pre-approved, hand-written listings, not user submissions.
 *
 *   npm run db:seed-items
 *
 * Dev only. Reads DATABASE_URL/R2_* from .env.local like every other script
 * here; nothing about this run targets production, and the production run
 * happens by hand later, against production env vars, after this is
 * verified on dev.
 *
 * Re-run guard, not full idempotency: an item is skipped when a row with
 * the same title_hy already exists for that user. Re-running after a
 * partial failure re-uploads images for anything that did not make it to
 * the database, which is wasted R2 traffic but not a correctness problem.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ITEMS_ROOT = path.join(__dirname, 'items');

type Locale = 'hy' | 'ru' | 'en';
type LocalizedText = Record<Locale, string>;

type InfoItem = {
  images: string[];
  title: LocalizedText;
  description: LocalizedText;
  category: string;
  district: string;
  condition: ItemCondition;
  pickupNotes?: LocalizedText;
};

type Friend = { name: string; phone: string };

const VALID_CONDITIONS: readonly ItemCondition[] = ['working', 'needs_repair', 'for_parts'];

/**
 * The pipeline always re-encodes to JPEG, regardless of the source format.
 * Every source file here is a PNG screenshot, and a PNG re-encode of a real
 * photograph is lossless — several times the bytes of the same photo as
 * JPEG, routinely well past the 256 KB thumb budget (DECISIONS.md) at
 * 400px. A phone camera never produces PNG for a photo in the first place,
 * so JPEG output reproduces what an actual upload would look like, rather
 * than reproducing an artifact of how these particular files were saved.
 */
const OUTPUT_CONTENT_TYPE = 'image/jpeg' as const;

/** Matches ORIGINAL_QUALITY in src/lib/images/prepare.ts — the 0–1 scale
 * the browser's canvas encoder and THUMB_QUALITY_STEPS both use, converted
 * to sharp's 1–100 scale inside renderVariant. */
const ORIGINAL_QUALITY = 0.82;

type Size = { width: number; height: number };

/**
 * The account folder name (e.g. "albert") is the first word of the
 * matching friends.json entry's name, lowercased — that is the only key
 * shared between the two, since friends.json has no separate account-slug
 * field.
 */
function findFriend(account: string): Friend | undefined {
  return (friends as Friend[]).find((f) => f.name.split(' ')[0].toLowerCase() === account);
}

async function listAccounts(): Promise<string[]> {
  const entries = await readdir(ITEMS_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Resizes the decoded source to `size` and encodes it as JPEG. `quality` is
 * on the 0–1 scale (matching THUMB_QUALITY_STEPS/ORIGINAL_QUALITY) and
 * converted to sharp's 1–100 scale here, at the one place it matters.
 * Optional only because `encodeUnderCap`'s callback type allows `undefined`
 * for its PNG branch, which this pipeline never takes — every step in
 * THUMB_QUALITY_STEPS is a defined number.
 */
async function renderVariant(
  source: Buffer,
  size: Size,
  quality: number = ORIGINAL_QUALITY,
): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize(size.width, size.height, { fit: 'fill' })
    .jpeg({ quality: Math.round(quality * 100) })
    .toBuffer();
}

type PreparedVariants = {
  original: Buffer;
  thumb: Buffer;
  contentType: typeof OUTPUT_CONTENT_TYPE;
  width: number;
  height: number;
  blurhash: string;
};

/**
 * One photo → a compressed original (1600px longest edge) and a 400px
 * thumbnail (256 KB budget, retried at lower quality like the browser's
 * THUMB_QUALITY_STEPS), plus a blurhash computed from the thumb.
 */
async function prepareVariants(fileBuffer: Buffer): Promise<PreparedVariants> {
  const metadata = await sharp(fileBuffer).rotate().metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read image dimensions');
  }

  const source: Size = { width: metadata.width, height: metadata.height };
  const originalSize = scaleToFit(source, ORIGINAL_LONGEST_EDGE);
  const thumbSize = scaleToFit(source, THUMB_LONGEST_EDGE);

  const original = await renderVariant(fileBuffer, originalSize, ORIGINAL_QUALITY);

  const { buffer: thumb } = await encodeUnderCap(
    async (quality) => {
      const buffer = await renderVariant(fileBuffer, thumbSize, quality);
      return { buffer, size: buffer.length };
    },
    THUMB_QUALITY_STEPS,
    THUMB_MAX_BYTES,
  );

  // Per spec: the blurhash is sampled from the thumb, not the original.
  const sampleSize = scaleToFit(thumbSize, BLURHASH_SAMPLE_EDGE);
  const components = blurhashComponents(thumbSize);
  const { data } = await sharp(thumb)
    .resize(sampleSize.width, sampleSize.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const hash = encode(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    sampleSize.width,
    sampleSize.height,
    components.x,
    components.y,
  );

  return {
    original,
    thumb,
    contentType: OUTPUT_CONTENT_TYPE,
    width: originalSize.width,
    height: originalSize.height,
    blurhash: hash,
  };
}

async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({ Bucket: getR2Bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

type UploadedImage = {
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  blurhash: string;
};

/**
 * Prepares and uploads one photo as two objects under
 * `uploads/{userId}/{uuid}.{ext}` — two distinct UUIDs, one per variant.
 */
async function uploadImage(
  accountDir: string,
  filename: string,
  userId: string,
): Promise<UploadedImage> {
  const fileBuffer = await readFile(path.join(accountDir, filename));
  const prepared = await prepareVariants(fileBuffer);

  // Two distinct UUIDs — generateObjectKey mints a fresh one on each call.
  const originalKey = generateObjectKey(userId, prepared.contentType);
  const thumbKey = generateObjectKey(userId, prepared.contentType);

  await Promise.all([
    putObject(originalKey, prepared.original, prepared.contentType),
    putObject(thumbKey, prepared.thumb, prepared.contentType),
  ]);

  return {
    url: publicUrl(originalKey),
    thumbUrl: publicUrl(thumbKey),
    width: prepared.width,
    height: prepared.height,
    blurhash: prepared.blurhash,
  };
}

type AccountSummary = { account: string; inserted: number; skipped: number; failed: number };

async function main(): Promise<void> {
  const accounts = await listAccounts();

  // ---- Resolve every account to a userId before touching R2 or inserting
  // anything. A partial seed (some accounts done, one missing) is worse
  // than not starting.
  const missing: string[] = [];
  const accountPhone = new Map<string, string>();

  for (const account of accounts) {
    const friend = findFriend(account);
    if (!friend) {
      missing.push(`${account}: no matching entry in friends.json`);
      continue;
    }
    const normalized = normalizeArmenianPhone(friend.phone);
    if (!normalized) {
      missing.push(`${account}: "${friend.phone}" is not a valid Armenian phone number`);
      continue;
    }
    accountPhone.set(account, normalized);
  }

  const phones = [...accountPhone.values()];
  const userRows =
    phones.length > 0
      ? await db
          .select({ id: users.id, phone: users.phone })
          .from(users)
          .where(inArray(users.phone, phones))
      : [];
  const userIdByPhone = new Map(userRows.map((u) => [u.phone, u.id]));

  const accountUserId = new Map<string, string>();
  for (const [account, phone] of accountPhone) {
    const userId = userIdByPhone.get(phone);
    if (!userId) {
      missing.push(`${account} (${phone}): no user has signed in with this phone yet`);
      continue;
    }
    accountUserId.set(account, userId);
  }

  if (missing.length > 0) {
    console.error('Aborting: could not resolve a user for every account:');
    for (const line of missing) console.error(`  - ${line}`);
    process.exit(1);
  }

  // ---- Reference data, looked up once.
  const categoryRows = await db
    .select({ id: categories.id, nameEn: categories.nameEn })
    .from(categories);
  const categoryIdByName = new Map(categoryRows.map((c) => [c.nameEn, c.id]));

  const districtRows = await db
    .select({ id: districts.id, nameEn: districts.nameEn })
    .from(districts)
    .where(eq(districts.region, 'yerevan'));
  const districtIdByName = new Map(districtRows.map((d) => [d.nameEn, d.id]));

  const summaries: AccountSummary[] = [];
  let expectedTotal = 0;

  // Every account in `accounts` resolved to a userId above, or the script
  // already aborted — iterating the map itself avoids re-asserting that.
  for (const [account, userId] of accountUserId) {
    const accountDir = path.join(ITEMS_ROOT, account);
    const infoItems: InfoItem[] = JSON.parse(
      await readFile(path.join(accountDir, 'info.json'), 'utf8'),
    );
    expectedTotal += infoItems.length;

    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of infoItems) {
      const label = `${account}/${item.title.hy}`;
      try {
        if (!VALID_CONDITIONS.includes(item.condition)) {
          throw new Error(`invalid condition "${item.condition}"`);
        }
        const categoryId = categoryIdByName.get(item.category);
        if (!categoryId) throw new Error(`unknown category "${item.category}"`);
        const districtId = districtIdByName.get(item.district);
        if (!districtId) throw new Error(`unknown district "${item.district}" (region=yerevan)`);

        const existing = await db
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.userId, userId), eq(items.titleHy, item.title.hy)))
          .limit(1);
        if (existing.length > 0) {
          console.log(`skip (already exists): ${label}`);
          skipped++;
          continue;
        }

        const uploaded = await Promise.all(
          item.images.map((filename) => uploadImage(accountDir, filename, userId)),
        );

        const itemId = randomUUID();
        await db.batch([
          db.insert(items).values({
            id: itemId,
            userId,
            categoryId,
            districtId,
            titleHy: item.title.hy,
            titleRu: item.title.ru,
            titleEn: item.title.en,
            descriptionHy: item.description.hy,
            descriptionRu: item.description.ru,
            descriptionEn: item.description.en,
            needsTranslation: false,
            sourceLocale: 'hy',
            condition: item.condition,
            pickupNotesHy: item.pickupNotes?.hy ?? null,
            pickupNotesRu: item.pickupNotes?.ru ?? null,
            pickupNotesEn: item.pickupNotes?.en ?? null,
            status: 'active',
            // expiresAt: left to the column default (now() + 30 days).
          }),
          db.insert(itemImages).values(
            uploaded.map((image, position) => ({
              itemId,
              url: image.url,
              thumbUrl: image.thumbUrl,
              width: image.width,
              height: image.height,
              blurhash: image.blurhash,
              position,
            })),
          ),
        ]);

        console.log(`inserted: ${label}`);
        inserted++;
      } catch (error) {
        console.error(
          `FAILED: ${label}: ${error instanceof Error ? error.message : String(error)}`,
        );
        failed++;
      }
    }

    summaries.push({ account, inserted, skipped, failed });
  }

  console.table(summaries);

  const processedTotal = summaries.reduce((sum, s) => sum + s.inserted + s.skipped + s.failed, 0);
  const insertedTotal = summaries.reduce((sum, s) => sum + s.inserted, 0);
  const failedTotal = summaries.reduce((sum, s) => sum + s.failed, 0);

  console.log(`\nExpected ${expectedTotal} items from info.json, processed ${processedTotal}.`);
  if (processedTotal !== expectedTotal) {
    console.warn('Mismatch — some items were neither inserted, skipped, nor recorded as failed.');
  }
  console.log(`Inserted ${insertedTotal}, failed ${failedTotal}.`);

  if (failedTotal > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
