/**
 * Intrinsic size of a PNG or WebP, from its header bytes. No dependency.
 *
 * parseBranding requires width and height on a logo (the header reserves the
 * space so it does not shift on load), and the upload form cannot be trusted
 * to supply them. sharp would do this and a great deal more, but it is a
 * native binary that has to build on every deploy target for the sake of one
 * 200KB header image. Reading the container headers is thirty lines.
 *
 * The type is decided by MAGIC BYTES, never by the file name or the
 * browser-supplied MIME type, both of which the uploader controls. That is
 * also the allowlist: anything that is not a PNG or a WebP is rejected here,
 * before it reaches the bucket. SVG in particular is excluded on purpose:
 * served from our own origin it can carry <script>, and next/image passes it
 * through untouched.
 *
 * No "server-only" marker: pure bytes in, numbers out, so the unit suite can
 * import it.
 */

export type ImageKind = "png" | "webp";

export interface ImageInfo {
  kind: ImageKind;
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(b: Uint8Array, at: number, len: number): string {
  return String.fromCharCode(...b.subarray(at, at + len));
}

function u24le(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
}

function u16le(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8);
}

function u32be(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
}

/** null when the bytes are neither a well-formed PNG nor a WebP. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  return readPng(bytes) ?? readWebp(bytes);
}

/*
  PNG: 8-byte signature, then the IHDR chunk, which the spec requires to be
  first: 4-byte length (13), "IHDR", width (u32 BE), height (u32 BE).
*/
function readPng(b: Uint8Array): ImageInfo | null {
  if (b.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (b[i] !== PNG_SIGNATURE[i]) return null;
  }
  if (ascii(b, 12, 4) !== "IHDR") return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  return valid(width, height) ? { kind: "png", width, height } : null;
}

/*
  WebP: RIFF container. "RIFF" <size> "WEBP" then one of three first chunks:

    VP8  (lossy)    frame header at chunk+10: width/height are the low 14 bits
                    of two u16 LE, after a 3-byte frame tag and 3-byte start
                    code (9d 01 2a).
    VP8L (lossless) 1 signature byte (2f), then 14 bits width-1, 14 bits
                    height-1 packed little-endian.
    VP8X (extended) 4 bytes flags/reserved, then canvas width-1 and
                    height-1 as u24 LE each.
*/
function readWebp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;

  const chunk = ascii(b, 12, 4);
  let width = 0;
  let height = 0;

  if (chunk === "VP8 ") {
    // Start code guards against a truncated or mislabelled frame.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    width = u16le(b, 26) & 0x3fff;
    height = u16le(b, 28) & 0x3fff;
  } else if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (chunk === "VP8X") {
    width = u24le(b, 24) + 1;
    height = u24le(b, 27) + 1;
  } else {
    return null;
  }

  return valid(width, height) ? { kind: "webp", width, height } : null;
}

/** Same bounds parseBranding enforces on a logo, so a pass here saves. */
function valid(w: number, h: number): boolean {
  return Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 && w <= 4000 && h <= 4000;
}
