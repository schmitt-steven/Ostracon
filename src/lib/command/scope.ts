import { tagFromSegments, TAGS_HREF, UNTAGGED_HREF } from "@/lib/tags/routes";

/**
 * What the palette is pointed at, as the chip above the field states it.
 * `null` (no chip) is "everything". `tags` is the odd one — not a filter: it
 * ranks tags first but still shows all notes. See [CommandPalette].
 */
export type PaletteScope =
  { kind: "tag"; name: string } | { kind: "untagged" } | { kind: "tags" };

/**
 * The scope a route rests at, read from the pathname — the palette sits above
 * the router and reads the route rather than being told.
 */
export function scopeFromPath(pathname: string): PaletteScope | null {
  if (pathname.startsWith("/t/")) {
    return { kind: "tag", name: tagFromSegments(pathname.slice(3).split("/")) };
  }
  if (pathname === UNTAGGED_HREF) return { kind: "untagged" };
  if (pathname === TAGS_HREF) return { kind: "tags" };
  return null;
}

/** The tag behind a scope, if it is one (a note's `from`, a new note's tag). */
export function scopeTag(scope: PaletteScope | null): string | null {
  return scope?.kind === "tag" ? scope.name : null;
}

/** The chip's words, and the same words wherever a sentence names the scope. */
export function scopeLabel(scope: PaletteScope): string {
  if (scope.kind === "tag") return `#${scope.name}`;
  return scope.kind === "untagged" ? "Untagged" : "All tags";
}

/**
 * What the search does from here, in one phrase — the palette placeholder and
 * the rail's field-shaped button, kept identical so they can't drift. Callers
 * add the ellipsis. No `null` case: with no scope the two genuinely differ.
 */
export function scopePrompt(scope: PaletteScope): string {
  if (scope.kind === "tag") return `Search #${scope.name}`;
  return scope.kind === "untagged"
    ? "Search untagged notes"
    : "Search tags";
}
