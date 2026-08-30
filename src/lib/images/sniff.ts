/**
 * What an image actually is, read from its first bytes — as opposed to
 * [isAllowedImageType], which trusts a caller-supplied MIME label. Needed
 * where there's no trustworthy label: zip entries in an archive import, and
 * hand-built FormData POSTed to `/api/uploads`. Same allowlist as
 * [IMAGE_MIME_TYPES]; SVG is absent because a text document has no magic
 * number. Runs on both the client (cheap pre-check) and the route (the
 * control).
 */

import type { IMAGE_MIME_TYPES } from "./upload-rules";

export type SniffedImageType = (typeof IMAGE_MIME_TYPES)[number];

/** Enough for every signature below; AVIF's brand ends at byte 12. */
export const SNIFF_BYTES = 16;

function starts(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

/** `length` ASCII characters at `offset`, or "" if the buffer is too short. */
function ascii(bytes: Uint8Array, offset: number, length = 4): string {
  if (bytes.length < offset + length) return "";
  let text = "";
  for (let i = 0; i < length; i++) text += String.fromCharCode(bytes[offset + i]!);
  return text;
}

// AVIF is ISO-BMFF: a `ftyp` box whose major brand names the flavour. `avis`
// is the animated brand, accepted alongside `avif`.
const AVIF_BRANDS = new Set(["avif", "avis"]);

/**
 * The image type these bytes really are, or null for anything not on the
 * allowlist. Only the first [SNIFF_BYTES] are ever read, so a caller can slice
 * the head of a large file rather than hold all of it.
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // Every JPEG variant — JFIF, Exif, raw — opens SOI followed by a marker.
  if (starts(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  const gif = ascii(bytes, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  // RIFF container with a WEBP form type; the four bytes between them are the
  // file length, which is not part of the signature.
  if (ascii(bytes, 0) === "RIFF" && ascii(bytes, 8) === "WEBP") {
    return "image/webp";
  }
  if (ascii(bytes, 4) === "ftyp" && AVIF_BRANDS.has(ascii(bytes, 8))) {
    return "image/avif";
  }
  return null;
}
