import "server-only";
import { localDiskStorage } from "./local";
import type { UploadStorage } from "./types";
import { vercelBlobStorage } from "./vercel-blob";

export type { StoredObject, UploadStorage } from "./types";

/**
 * The store this deployment uses. `STORAGE_DRIVER` decides when set;
 * otherwise a Blob token means Vercel Blob (every existing Vercel install
 * has one) and its absence means a folder on disk.
 */
export function getStorage(): UploadStorage {
  const driver = process.env.STORAGE_DRIVER;
  if (driver === "local") return localDiskStorage;
  if (driver === "vercel-blob") return vercelBlobStorage;
  if (driver) {
    throw new Error(
      `Unknown STORAGE_DRIVER "${driver}" — use "local" or "vercel-blob".`,
    );
  }
  return process.env.BLOB_READ_WRITE_TOKEN ? vercelBlobStorage : localDiskStorage;
}
