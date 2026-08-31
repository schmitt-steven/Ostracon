/**
 * The File Handling API, which TypeScript's DOM library doesn't carry yet.
 * Only what NoteImport's consumer touches — the queue exists on Chromium
 * desktop and nowhere else, hence the optional property.
 *
 * Same arrangement as src/icons/svg.d.ts: a declaration for something real
 * that the type system hasn't been told about.
 */
interface LaunchParams {
  readonly files: readonly FileSystemFileHandle[];
}

interface LaunchQueue {
  /** Callable once per page load; a second call is ignored by the browser. */
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

interface Window {
  readonly launchQueue?: LaunchQueue;
}
