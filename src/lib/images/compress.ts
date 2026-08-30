/**
 * Shrinking an image in the browser before it's sent — re-encode to WebP at
 * 2000px on the long edge.
 *
 * Left alone: anything under [COMPRESS_MIN_BYTES] (re-encoding can grow it),
 * GIFs (canvas decodes one frame, so it'd drop the animation), and any result
 * that didn't come out smaller.
 *
 * Every failure path returns the original file — never refuses the image.
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
  // OffscreenCanvas keeps this off the DOM; older Safari falls back to a
  // detached <canvas>.
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
    // `blob.type`, not the requested type — a browser that can't encode WebP
    // silently returns a PNG.
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
