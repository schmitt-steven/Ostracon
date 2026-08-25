"use client";

// Where a dropped image goes: the note that is open, if one is.
//
// The same shape as the palette's contextual commands (lib/command/registry),
// and for the same reason. Files are dropped on the *window* — the handler
// that catches them is mounted in the shell, above the router — while the only
// thing that can take an image is the editor, several levels below it. A
// registry is how the two find each other without every layout in between
// carrying a prop it has no use for.

/**
 * `at` is the drop's viewport coordinates, so the editor can put the image
 * where the pointer let go rather than at the caret. Absent when the images
 * came from the file dialog, which has no position to speak of.
 */
export type ImageInsert = (files: File[], at?: { x: number; y: number }) => void;

let target: ImageInsert | null = null;

export function getImageTarget(): ImageInsert | null {
  return target;
}

/**
 * Claims the drop target, and returns the teardown. Last one wins outright —
 * there is only ever one editor on screen — and the teardown only clears if
 * nothing else has claimed it since, because on a navigation the new editor
 * mounts before the old one's cleanup runs.
 */
export function registerImageTarget(insert: ImageInsert): () => void {
  target = insert;
  return () => {
    if (target !== insert) return;
    target = null;
  };
}
