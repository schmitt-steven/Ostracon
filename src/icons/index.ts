/**
 * Every glyph in the app, one `.svg` file each. Compiled to React components
 * at build time (SVGR — see `turbopack.rules` in next.config.ts), not served
 * from `public/`, so they're `currentColor` and follow hover/selected states.
 * Each carries only geometry; size is `className` at the call site.
 */

// The 24 box, stroke 1.75 — the heavier set, drawn for 16px and up.
export { default as SearchIcon } from "./search.svg";
export { default as TrashIcon } from "./trash.svg";
export { default as EditIcon } from "./edit.svg";

// The 16 box, stroke 1.3 — the sidebar set, drawn for 14px.
export { default as PlusIcon } from "./plus.svg";
export { default as NotesIcon } from "./notes.svg";
export { default as TagIcon } from "./tag.svg";
export { default as ImagesIcon } from "./images.svg";
export { default as GearIcon } from "./gear.svg";
/** Arrow onto a line — the update row. Not a tray: at 14px the box reads as noise. */
export { default as DownloadIcon } from "./download.svg";
export { default as LogOutIcon } from "./log-out.svg";
export { default as ListIcon } from "./list.svg";
export { default as PencilIcon } from "./pencil.svg";
export { default as EyeIcon } from "./eye.svg";

// The two device shapes (see [deviceKind]) — the sessions list draws one per
// row. Distinguished by silhouette, since 14px is all that gets read.
export { default as DesktopIcon } from "./desktop.svg";
export { default as PhoneIcon } from "./phone.svg";

/** Filled, not stroked — three 1.15r dots want solid mass at 14px. */
export { default as DotsIcon } from "./dots.svg";

// Two ✕ at two weights, not one file scaled — the 11px chip mark needs more
// relative mass than the 16px lightbox mark.
export { default as CloseIcon } from "./close.svg";
export { default as CloseSmallIcon } from "./close-small.svg";

// The 12 box — marks that live inside menus and fields.
export { default as ChevronDownIcon } from "./chevron-down.svg";
export { default as CheckIcon } from "./check.svg";

// The find widget's three verbs, in the same 12 box. The two arrows are drawn
// rather than one rotated, on the principle above: an imported `.svg` is a
// finished component, and a `-rotate-180` in the markup hides which direction
// a button means behind a transform.
export { default as ArrowUpIcon } from "./arrow-up.svg";
export { default as ArrowDownIcon } from "./arrow-down.svg";
/** A marquee round two lines of text — "select every match". */
export { default as SelectAllIcon } from "./select-all.svg";

// The sidebar glyph in its two states — filled while the sidebar shows, so it
// pictures the current state. Two files, since an imported `.svg` is a
// finished component with no way to swap a path inside it.
export { default as PanelLeftIcon } from "./panel-left.svg";
export { default as PanelLeftFilledIcon } from "./panel-left-filled.svg";

/** Pinned and not, on the same principle as the panel pair above. */
export { default as PinOutlineIcon } from "./pin.svg";
export { default as PinFilledIcon } from "./pin-filled.svg";

/** The plus at 24/1.6, for the import drop zone, where it's drawn at 28px and
 *  the sidebar's hairline plus would vanish. */
export { default as PlusLargeIcon } from "./plus-large.svg";
