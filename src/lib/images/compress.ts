/**
 * Shrinking an image in the browser, before it is ever sent.
 *
 * A phone photo is six megabytes of detail nobody can see in a 680px column,
 * and every copy of it is paid for twice — once in the blob store forever, and
 * once in the seconds the reader spends waiting for it. Re-encoding to WebP at
 * 2000px on the long edge turns that six megabytes into a few hundred
 * kilobytes that looks identical in a note.
 *
 * The cap in [upload-rules] then only ever fires on something genuinely wrong,
 * rather than on a normal photo.
 *
 * Three things are left alone:
 *
 * - **Anything already small.** Under [COMPRESS_MIN_BYTES] there is nothing to
 *   win, and re-encoding a small PNG of flat colour reliably makes it *bigger*.
 * - **GIFs.** Canvas decodes one frame, so compressing an animation is
 *   silently deleting it.
 * - **Any result that didn't help.** The re-encode is kept only if it actually
 *   came out smaller, so no image is ever made worse by passing through here.
 *
 * Transparency needs no rule of its own: WebP has an alpha channel, so the
 * screenshots this is most useful on — macOS writes them as RGBA PNGs — keep
 * whatever transparency they had. It is JPEG that would flatten them, and
 * nothing here encodes JPEG.
 *
 * Every failure path returns the original file. A browser without
 * `createImageBitmap`, a decode that throws on a malformed file, an encoder
 * that hands back the wrong format — all of them mean "upload what you were
 * given", never "refuse the image".
 */

/** Below this, re-encoding costs more than it saves. */
const COMPRESS_MIN_BYTES = 800 * 1024;

/** The long edge, in CSS pixels. Twice the widest column a note ever has. */
const MAX_EDGE = 2000;

const QUALITY = 0.85;

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/** `photo.HEIC.png` → `photo.HEIC.webp` — the last extension is the format. */
function renamed(name: string, type: string): string {
  const extension = EXTENSIONS[type];
  if (!extension) return name;
  const base = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${base}.${extension}`;
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob | null> {
  // OffscreenCanvas keeps the decode and the encode off the DOM entirely.
  // Where it isn't available (older Safari), a detached <canvas> does the same
  // job through the callback API.
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", QUALITY);
  });
}

export async function compressImage(file: File): Promise<File> {
  if (file.size <= COMPRESS_MIN_BYTES) return file;
  if (file.type === "image/gif") return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const blob = await encode(bitmap, width, height);
    // `blob.type` rather than the type asked for: a browser that can't encode
    // WebP hands back a PNG without saying so, and the file has to describe
    // what it actually is — the upload route checks the type it is given.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], renamed(file.name, blob.type), {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
