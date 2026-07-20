import { inflateRawSync } from 'zlib';

// Minimal ZIP reader — supports STORE (0) and DEFLATE (8), the two methods
// every mainstream zip tool (Windows "Compress", macOS Archive Utility,
// 7-Zip default, JSZip) uses. No encryption/multi-volume support. Written by
// hand instead of adding a new dependency just to unzip a handful of photos.
export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();

  const EOCD_SIG = 0x06054b50;
  const maxBack = Math.min(buffer.length, 65557); // max comment length (64KB) + EOCD record size
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= buffer.length - maxBack && i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) return entries; // not a valid (or empty) zip

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  const CENTRAL_SIG = 0x02014b50;
  for (let i = 0; i < totalEntries; i++) {
    if (cdOffset + 46 > buffer.length || buffer.readUInt32LE(cdOffset) !== CENTRAL_SIG) break;

    const compressionMethod = buffer.readUInt16LE(cdOffset + 10);
    const compressedSize    = buffer.readUInt32LE(cdOffset + 20);
    const fileNameLength    = buffer.readUInt16LE(cdOffset + 28);
    const extraFieldLength  = buffer.readUInt16LE(cdOffset + 30);
    const fileCommentLength = buffer.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(cdOffset + 42);
    const fileName = buffer.toString('utf8', cdOffset + 46, cdOffset + 46 + fileNameLength);

    if (!fileName.endsWith('/')) {
      const localFileNameLength   = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
      const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

      try {
        let data: Buffer | null = null;
        if (compressionMethod === 0) data = Buffer.from(compressedData);
        else if (compressionMethod === 8) data = inflateRawSync(compressedData);
        if (data) {
          // Keep only the basename — entries may sit inside a folder in the zip.
          const baseName = fileName.split(/[\\/]/).pop() || fileName;
          entries.set(baseName, data);
        }
      } catch {
        // Corrupt or unsupported entry — skip it, don't fail the whole import.
      }
    }

    cdOffset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
};

export function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return EXT_MIME[ext] || 'application/octet-stream';
}
