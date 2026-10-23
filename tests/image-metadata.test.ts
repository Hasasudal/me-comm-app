import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripJpegMetadata, stripPngMetadata, stripWebpMetadata } from '../lib/image-metadata.ts';

const bytes = (...parts: (ArrayLike<number> | string)[]) =>
  Uint8Array.from(
    parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : Array.from(part))),
  );
const text = (data: Uint8Array) => String.fromCharCode(...data);

test('jpeg drops APP1 and keeps the rest', () => {
  const app0 = [0xff, 0xe0, 0, 4, 1, 2];
  const app1 = [0xff, 0xe1, 0, 6, ...'GPS!'.split('').map((c) => c.charCodeAt(0))];
  const scan = [0xff, 0xda, 9, 9, 0xff, 0xd9];
  assert.deepEqual(stripJpegMetadata(bytes([0xff, 0xd8], app0, app1, scan)), bytes([0xff, 0xd8], app0, scan));
  assert.equal(stripJpegMetadata(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 99])), null, 'length past end');
});

const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (type: string, data: string) => bytes([0, 0, 0, data.length], type, data, [1, 2, 3, 4]); // CRC unchecked

test('png drops text, exif and time chunks and anything after IEND', () => {
  const ihdr = png('IHDR', 'abcdefghijklm'),
    idat = png('IDAT', 'pixels'),
    iend = png('IEND', '');
  const input = bytes(sig, ihdr, png('tEXt', 'GPS\0here'), png('eXIf', 'MM'), idat, png('tIME', '1234567'), png('iTXt', 'x'), iend, 'junk');
  assert.deepEqual(stripPngMetadata(input), bytes(sig, ihdr, idat, iend));
  assert.equal(stripPngMetadata(bytes(sig, ihdr)), null, 'no IEND');
  assert.equal(stripPngMetadata(bytes(sig, [0, 0, 1, 0], 'IDAT', 'short')), null, 'chunk past end');
  assert.equal(stripPngMetadata(bytes('notapng!')), null);
});

const le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
const chunk = (type: string, data: number[] | string) => {
  const body = typeof data === 'string' ? bytes(data) : Uint8Array.from(data);
  return bytes(type, le(body.length), body, body.length & 1 ? [0] : []);
};
const riff = (...chunks: Uint8Array[]) => {
  const inner = bytes('WEBP', ...chunks);
  return bytes('RIFF', le(inner.length), inner);
};

test('webp drops EXIF and XMP, clears the VP8X flags and fixes the RIFF size', () => {
  const vp8 = chunk('VP8 ', 'frame'); // odd length, padded
  const out = stripWebpMetadata(
    riff(chunk('VP8X', [0x0c | 0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0]), vp8, chunk('EXIF', 'GPS'), chunk('XMP ', '<x/>')),
  );
  assert.ok(out);
  assert.deepEqual(out, riff(chunk('VP8X', [0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0]), vp8));
  assert.equal(new DataView(out.buffer).getUint32(4, true), out.length - 8);
  assert.ok(!text(out).includes('GPS'));
  const broken = riff(vp8);
  broken[16] = 200; // chunk size past the RIFF end
  assert.equal(stripWebpMetadata(broken), null);
  assert.equal(stripWebpMetadata(bytes('RIFF', le(999), 'WEBP')), null, 'RIFF size past end');
});
