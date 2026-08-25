import { tagFromSegments, TAGS_HREF, UNTAGGED_HREF } from "@/lib/tags/routes";

/**
 * What the palette is pointed at, as the chip above the field states it.
 *
 * It was a tag name or nothing, which was true for as long as the only thing
 * worth narrowing to was a tag. The two overview pages that aren't a tag want
 * the same treatment and neither is a name: Untagged is the notes no tag
 * reaches, and All tags is the collection of tags itself. So the scope is a
 * shape rather than a string, and `null` — no chip — stays "everything".
 *
 * `tags` is the odd one and deliberately so: it is the only one that isn't a
 * filter. On the tag directory the thing in front of you *is* a list of tags,
 * so the search that opens from its heading puts the tags on top — and leaves
 * every note underneath them, because a chip that could hide results would be
 * one you have to drop before you can trust what the palette says. See
 * [CommandPalette].
 */
export type PaletteScope =
  { kind: "tag"; name: string } | { kind: "untagged" } | { kind: "tags" };

/**
 * The scope a route rests at, read from the pathname.
 *
 * The palette is mounted in the shell, above the router, so it reads the route
 * rather than being told — a page that had to remember to announce itself is a
 * page that will one day forget. This is also why the header buttons don't
 * carry a scope: ⌘K and the magnifier open the same palette in the same place,
 * and they agree because neither of them decides.
 */
export function scopeFromPath(pathname: string): PaletteScope | null {
  if (pathname.startsWith("/t/")) {
    return { kind: "tag", name: tagFromSegments(pathname.slice(3).split("/")) };
  }
  if (pathname === UNTAGGED_HREF) return { kind: "untagged" };
  if (pathname === TAGS_HREF) return { kind: "tags" };
  return null;
}

/**
 * The tag behind a scope, if it is one — for the places that can only mean a
 * tag: the `from` on a note's link, the tag a new note would be filed under.
 */
export function scopeTag(scope: PaletteScope | null): string | null {
  return scope?.kind === "tag" ? scope.name : null;
}

/** The chip's words, and the same words wherever a sentence names the scope. */
export function scopeLabel(scope: PaletteScope): string {
  if (scope.kind === "tag") return `#${scope.name}`;
  return scope.kind === "untagged" ? "Untagged" : "All tags";
}

/**
 * What the search will do from here, in one phrase — the palette's own
 * placeholder, and the rail's button, which is a button dressed as that field.
 *
 * One sentence for both, because they are one control seen twice: the rail's
 * says what you will get before you press it, and the field it turns into
 * repeats it back with the chip beside it. They drifted apart the moment they
 * were written out separately — the rail went on offering to search everything
 * from inside a tag that the palette then opened already narrowed to.
 *
 * The ellipsis belongs to the call site: it is a field's trailing-off, and the
 * places that aren't a field don't want it.
 *
 * No case for `null`. With no scope the two genuinely differ — the field lists
 * what it searches, the rail's button advertises that the palette also does
 * and jumps to things — and a shared "everything" phrasing would flatten one
 * of them into the other.
 */
export function scopePrompt(scope: PaletteScope): string {
  if (scope.kind === "tag") return `Search #${scope.name}`;
  // "Tags and notes", in that order, because that is the order they come back
  // in — the words say what the list is about to do.
  return scope.kind === "untagged"
    ? "Search untagged notes"
    : "Search tags";
}
