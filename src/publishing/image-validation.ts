import sharp from 'sharp';
import {fail} from '../platform/auth';

export const MAX_IMAGE_BYTES = 512 * 1024;
export const MAX_IMAGE_PIXELS = 16_000_000;
let activeTransforms = 0;

function recognizedRaster(bytes: Buffer) {
  return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
}
function animatedPng(bytes: Buffer) {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) break;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    if (type === 'IEND') break;
    offset += length + 12;
  }
  return false;
}

/** Decode and re-encode raster pixels only. No remote fetches, SVG rendering,
 * original-file downloads or metadata-retention options are accepted. */
export async function canonicalPublicImage(base64: string) {
  if (base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    fail(400, 'Choose an image of at most 512 KiB.');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== base64 || !recognizedRaster(bytes))
    fail(400, 'Choose a valid JPEG, PNG or WebP image.');
  if (activeTransforms >= 2) fail(429, 'Image processing is busy. Please retry shortly.');
  activeTransforms++;
  try {
    const image = sharp(bytes, {limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning', sequentialRead: true}).timeout({seconds: 5});
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || !metadata.width || !metadata.height ||
        metadata.width * metadata.height > MAX_IMAGE_PIXELS || (metadata.pages || 1) !== 1 ||
        (metadata.format === 'png' && animatedPng(bytes)))
      fail(400, 'Choose a static image of at most 16 million pixels.');
    const output = await image.rotate().resize({width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true})
      .webp({quality: 82, alphaQuality: 100, effort: 4}).toBuffer({resolveWithObject: true});
    if (output.data.length > MAX_IMAGE_BYTES) fail(400, 'The processed image is too large. Choose a smaller image.');
    return {bytes: output.data, width: output.info.width, height: output.info.height, mime: 'image/webp' as const};
  } catch (error) {
    if ((error as any).status) throw error;
    return fail(400, 'This image could not be safely decoded. Choose a valid static JPEG, PNG or WebP.');
  } finally {
    activeTransforms--;
  }
}
