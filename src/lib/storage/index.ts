import "server-only";
import { localDiskStorage } from "./local";
import type { UploadStorage } from "./types";
import { vercelBlobStorage } from "./vercel-blob";

export type { StoredFile, StoredObject, UploadStorage } from "./types";

/**
 * The store this deployment uses. `STORAGE_DRIVER` decides when set.
 * Otherwise any Blob credential means Vercel Blob — a read-write token, or a
 * store id, which is all a store connected through Vercel's OIDC
 * integration provides — and none means a folder on disk.
 *
 * Disk is never right on Vercel: the function's filesystem is read-only and
 * gone after the request. A deployment there without Blob credentials gets an
 * error that says so, rather than a write that fails for a reason nobody
 * would guess.
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

  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
    return vercelBlobStorage;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "No Blob store is connected to this Vercel project (neither BLOB_READ_WRITE_TOKEN nor BLOB_STORE_ID is set). Connect a private Blob store and redeploy.",
    );
  }
  return localDiskStorage;
}
