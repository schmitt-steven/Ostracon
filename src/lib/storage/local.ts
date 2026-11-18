import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { isUploadPathname } from "@/lib/images/references";
import { SNIFF_BYTES, sniffImageType } from "@/lib/images/sniff";
import type { StoredObject, UploadStorage } from "./types";

/**
 * Uploads as plain files in a folder — what a self-hosted install uses
 * instead of Vercel Blob. In Docker that folder is a volume (`/data/uploads`);
 * in `next dev` it defaults to `.data/uploads` in the project, which is
 * gitignored.
 */

/** The folder uploads are written to, absolute. Shown in settings too. */
export function uploadRoot(): string {
  return path.resolve(
    process.env.UPLOAD_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "uploads"),
  );
}

/**
 * A pathname's file, or null for anything the upload route couldn't have
 * written. This is the only way a pathname reaches the filesystem, so it is
 * the traversal guard.
 */
function fileFor(pathname: string): string | null {
  if (!isUploadPathname(pathname)) return null;
  const root = uploadRoot();
  const file = path.join(root, ...pathname.split("/"));
  // Belt and braces — the pathname check already rules out `..`.
  return file.startsWith(root + path.sep) ? file : null;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/** The image type of a stored file, read from its first bytes. */
async function sniffFile(file: string): Promise<string | null> {
  const head = new Uint8Array(SNIFF_BYTES);
  const handle = await open(file, "r");
  try {
    await handle.read(head, 0, SNIFF_BYTES, 0);
  } finally {
    await handle.close();
  }
  return sniffImageType(head);
}

export const localDiskStorage: UploadStorage = {
  kind: "local",

  // The content type isn't stored: `get` sniffs it from the bytes again, the
  // same check the upload route made on the way in.
  async put(pathname, file) {
    const target = fileFor(pathname);
    if (!target) throw new Error(`Refusing to store an unsafe path: ${pathname}`);
    await mkdir(path.dirname(target), { recursive: true });
    // `wx`: never overwrite — the same rule Blob applies to an existing pathname.
    await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  },

  async list(prefix = "") {
    const root = uploadRoot();
    let directories: string[];
    try {
      directories = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error) {
      if (isMissing(error)) return []; // Nothing uploaded yet.
      throw error;
    }

    const objects: StoredObject[] = [];
    for (const directory of directories) {
      for (const name of await readdir(path.join(root, directory))) {
        const pathname = `${directory}/${name}`;
        if (!pathname.startsWith(prefix)) continue;
        const file = fileFor(pathname);
        if (!file) continue;
        const info = await stat(/* turbopackIgnore: true */ file).catch(() => null);
        if (!info?.isFile()) continue;
        objects.push({ pathname, size: info.size, uploadedAt: info.mtime });
      }
    }
    return objects;
  },

  async delete(pathnames) {
    for (const pathname of pathnames) {
      const file = fileFor(pathname);
      if (!file) continue;
      try {
        await unlink(file);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
  },

  async get(pathname) {
    const file = fileFor(pathname);
    if (!file) return null;
    const info = await stat(/* turbopackIgnore: true */ file).catch(() => null);
    if (!info?.isFile()) return null;
    return {
      stream: Readable.toWeb(createReadStream(/* turbopackIgnore: true */ file)) as ReadableStream<Uint8Array>,
      size: info.size,
      contentType: await sniffFile(file),
    };
  },
};
