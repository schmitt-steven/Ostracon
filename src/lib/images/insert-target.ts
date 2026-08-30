"use client";

// Where a dropped image goes: the open note, if there is one. A registry (like
// lib/command/registry) so the window-level drop handler in the shell and the
// editor below the router can find each other.

/**
 * `at` is the drop's viewport coordinates, so the image lands where the
 * pointer let go. Absent for the file dialog, which has no position.
 */
export type ImageInsert = (files: File[], at?: { x: number; y: number }) => void;

let target: ImageInsert | null = null;

export function getImageTarget(): ImageInsert | null {
  return target;
}

/**
 * Claims the drop target, returns the teardown. Last claim wins; the teardown
 * only clears if nothing else has claimed it since.
 */
export function registerImageTarget(insert: ImageInsert): () => void {
  target = insert;
  return () => {
    if (target !== insert) return;
    target = null;
  };
}
