// Plain require, not a typed import: sharp's package.json "types" field
// resolves to its ESM declarations under this project's module resolution,
// which don't declare the callable default export the CJS build actually has.
const sharp = require('sharp');

// Vector/already-tiny formats gain nothing from raster resizing.
const SKIP_MIME_TYPES = new Set(['image/svg+xml', 'image/gif']);

// Resizes a raster image buffer down to a small JPEG for use as a list/card
// thumbnail. Returns null for non-images (video, PDF, CAD/3D files, SVG) or
// if the image fails to decode — callers should fall back to the original.
export async function generateThumbnail(buffer: Buffer, mimetype: string | undefined): Promise<Buffer | null> {
  if (!mimetype?.startsWith('image/') || SKIP_MIME_TYPES.has(mimetype)) return null;
  try {
    return await sharp(buffer)
      .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch {
    return null;
  }
}
