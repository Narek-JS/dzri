// Generates the Android notification small icon (white silhouette on
// transparent background) from the dzri logo. Android 5.0+ draws every
// non-transparent pixel of a notification icon as white and tints it with
// the accent color, so a full-color source has to be converted rather than
// just resized.
//
// Run from the repo root (sharp is a root dependency, not a mobile/ one):
//   node mobile/scripts/gen-notification-icon.mjs

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_LOGO = path.resolve('mobile/assets/logo.svg');

const RENDER_SIZE = 1024; // rasterize the source vector at high res before downsampling
const PADDING_FRACTION = 0.1; // per side

const DENSITIES = {
  'drawable-mdpi': 24,
  'drawable-hdpi': 36,
  'drawable-xhdpi': 48,
  'drawable-xxhdpi': 72,
  'drawable-xxxhdpi': 96,
};

const RES_DIR = path.resolve('mobile/android/app/src/main/res');

async function buildWhiteSilhouette() {
  const rendered = await sharp(SOURCE_LOGO, { density: 300 })
    .resize(RENDER_SIZE, RENDER_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = rendered;
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += info.channels) {
    out[i] = 255; // R
    out[i + 1] = 255; // G
    out[i + 2] = 255; // B
    out[i + 3] = data[i + 3]; // preserve source alpha untouched (antialiasing intact)
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function writeDensity(silhouette, dirName, size) {
  const glyphSize = Math.round(size * (1 - 2 * PADDING_FRACTION));
  const pad = size - glyphSize;
  const padTop = Math.floor(pad / 2);
  const padBottom = pad - padTop;
  const padLeft = Math.floor(pad / 2);
  const padRight = pad - padLeft;

  const dir = path.join(RES_DIR, dirName);
  await mkdir(dir, { recursive: true });

  const resized = await sharp(silhouette)
    .resize(glyphSize, glyphSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Resizing/extending blends alpha into RGB and can round 255 down to 254
  // at edge pixels. Force pure white back onto every pixel, keeping only
  // the alpha this pipeline produced, so the output is exactly white-or-
  // transparent with antialiased alpha at the edges.
  const { data, info } = resized;
  for (let i = 0; i < data.length; i += info.channels) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(path.join(dir, 'ic_stat_notify.png'));

  console.log(`wrote ${dirName}/ic_stat_notify.png (${size}x${size})`);
}

const silhouette = await buildWhiteSilhouette();
for (const [dirName, size] of Object.entries(DENSITIES)) {
  await writeDensity(silhouette, dirName, size);
}
