/**
 * Where uploaded images live. Two places implement this: a private Vercel
 * Blob store (the hosted deployment) and a folder on disk (self-hosting, see
 * ./local.ts). Neither is reachable from a browser directly — the upload
 * route writes through this interface and app/uploads reads through it, after
 * checking the session — so everything above this line works in pathnames
 * (`notes/1740000000000-diagram.png`) and never sees a store's own URLs.
 */

export type StoredObject = {
  pathname: string;
  size: number;
  uploadedAt: Date;
};

export type StoredFile = {
  stream: ReadableStream<Uint8Array>;
  size: number;
  /** What the bytes are, as checked at upload; null if the store can't say. */
  contentType: string | null;
};

export interface UploadStorage {
  /** Shown in settings; also how callers tell the stores apart, if they must. */
  readonly kind: "vercel-blob" | "local";

  /** Never overwrites — a pathname, once written, always means the same bytes. */
  put(pathname: string, file: Blob, contentType: string): Promise<void>;

  /** Everything under `prefix` (all of it without one), every page followed. */
  list(prefix?: string): Promise<StoredObject[]>;

  /** A missing pathname is not an error. */
  delete(pathnames: string[]): Promise<void>;

  /** The bytes at `pathname`, or null when there are none. */
  get(pathname: string): Promise<StoredFile | null>;
}
