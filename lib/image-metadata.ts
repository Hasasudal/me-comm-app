// Strips location and other personal metadata from uploads. Pure byte work (no Workers imports), so tests can run it.
// Each function keeps everything else byte for byte and returns null when the structure does not add up, so a
// malformed file is rejected rather than stored.

function join(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
const ascii = (bytes: Uint8Array, from: number) => String.fromCharCode(...bytes.subarray(from, from + 4));

// Drops APP1 segments (EXIF, incl. GPS, and XMP) from a JPEG.
export function stripJpegMetadata(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at++; // fill byte
      continue;
    }
    if (marker === 0xda) break; // start of scan: the rest is image data
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (end > bytes.length || end < at + 4) return null;
    if (marker !== 0xe1) kept.push(bytes.subarray(at, end));
    at = end;
  }
  if (bytes[at] !== 0xff || bytes[at + 1] !== 0xda) return null;
  kept.push(bytes.subarray(at));
  return join(kept);
}

// PNG: EXIF and text chunks (which can hold GPS, author, software) and the timestamp go; chunks are copied whole,
// so CRCs stay valid. Anything after IEND is dropped too.
const pngDropped = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
export function stripPngMetadata(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || signature.some((byte, i) => bytes[i] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const end = at + 12 + view.getUint32(at);
    if (end > bytes.length) return null;
    const type = ascii(bytes, at + 4);
    if (!pngDropped.has(type)) kept.push(bytes.subarray(at, end));
    if (type === 'IEND') return join(kept);
    at = end;
  }
  return null; // no IEND
}

// WebP: EXIF and XMP chunks go, VP8X stops announcing them, and the RIFF size is rewritten.
export function stripWebpMetadata(bytes: Uint8Array) {
  if (bytes.length < 12 || ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WEBP') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const total = 8 + view.getUint32(4, true);
  if (total > bytes.length) return null;
  const kept: Uint8Array[] = [bytes.slice(0, 12)];
  let at = 12;
  while (at < total) {
    if (at + 8 > total) return null;
    const size = view.getUint32(at + 4, true);
    const end = at + 8 + size + (size & 1); // chunks are padded to an even length
    if (end > total) return null;
    const type = ascii(bytes, at);
    if (type === 'VP8X') {
      if (size < 1) return null;
      const chunk = bytes.slice(at, end);
      chunk[8] &= ~0x0c; // XMP (0x04) and EXIF (0x08) flags
      kept.push(chunk);
    } else if (type !== 'EXIF' && type !== 'XMP ') kept.push(bytes.subarray(at, end));
    at = end;
  }
  const out = join(kept);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

export function stripMetadata(ext: string, bytes: Uint8Array) {
  if (ext === 'jpg') return stripJpegMetadata(bytes);
  if (ext === 'png') return stripPngMetadata(bytes);
  if (ext === 'webp') return stripWebpMetadata(bytes);
  return null;
}
