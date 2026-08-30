/**
 * Every glyph in the app, one file each, in one place.
 *
 * They used to be `function TagIcon()` declared at the foot of whichever
 * component first needed one — which is fine for the first, and by the
 * twentieth had produced six separate copies of the magnifier and four of the
 * bin, each free to drift from the others by a tenth of a stroke. A file per
 * drawing makes a second copy something you have to go out of your way to
 * make, and puts the whole set somewhere you can look at it at once.
 *
 * The `.svg` files are compiled to React components at build time (SVGR — see
 * `turbopack.rules` in next.config.ts), *not* served from `public/`. That
 * matters: the drawings are all `currentColor`, so they take their colour from
 * whatever they're nested in and follow it through hover and selected states.
 * Fetched as separate documents through `<img src>` they would lose every one
 * of those states and render one fixed colour.
 *
 * Each carries only its geometry, at the box and stroke weight it was drawn
 * for. Nothing here sets a size — that's `className` at the call site, because
 * the same bin is 16px in a settings table and the same magnifier is 14px in
 * the rail and 16px in the header.
 */

// The 24 box, stroke 1.75 — the heavier set, drawn for 16px and up.
export { default as SearchIcon } from "./search.svg";
export { default as TrashIcon } from "./trash.svg";
export { default as EditIcon } from "./edit.svg";

// The 16 box, stroke 1.3 — the rail set, drawn for 14px.
export { default as PlusIcon } from "./plus.svg";
export { default as NotesIcon } from "./notes.svg";
export { default as TagIcon } from "./tag.svg";
export { default as ImagesIcon } from "./images.svg";
export { default as GearIcon } from "./gear.svg";
export { default as LogOutIcon } from "./log-out.svg";
export { default as ListIcon } from "./list.svg";
export { default as PencilIcon } from "./pencil.svg";
export { default as EyeIcon } from "./eye.svg";

/**
 * The two shapes a signed-in device comes in — see [deviceKind].
 *
 * A pair, on the same principle as the panel and pin pairs below: the sessions
 * list draws exactly one of them per row, and what it is saying is *which*.
 * They are deliberately unalike in silhouette rather than in detail — one is
 * wider than it is tall, the other taller than it is wide — because at 14px in
 * a table column that outline is the whole of what gets read, and two rounded
 * rectangles distinguished by their stands would be one icon printed twice.
 */
export { default as DesktopIcon } from "./desktop.svg";
export { default as PhoneIcon } from "./phone.svg";

/** Filled rather than stroked: three 1.15r dots want solid mass at 14px. */
export { default as DotsIcon } from "./dots.svg";

// Two ✕ at two weights, and deliberately not one file scaled twice. Relative
// to its box the small one is 0.15 wide against the large one's 0.094 — the
// 11px chip mark needs that extra mass to read at all, and the 16px lightbox
// mark would look clumsy carrying it.
export { default as CloseIcon } from "./close.svg";
export { default as CloseSmallIcon } from "./close-small.svg";

// The 12 box — marks that live inside menus and fields.
export { default as ChevronDownIcon } from "./chevron-down.svg";
export { default as CheckIcon } from "./check.svg";

/**
 * The sidebar glyph, in its two states. The column that stands for the rail is
 * filled while the rail is showing and empty while it isn't, so the mark is a
 * picture of the *current state* rather than of what pressing it would do.
 *
 * Two files rather than one file and a conditional child, because an imported
 * `.svg` arrives as a finished component — there's no way to reach inside it
 * and add a path. Two drawings that differ by one shape is the honest shape of
 * this anyway: each file opens in an editor and shows you exactly what ships.
 */
export { default as PanelLeftIcon } from "./panel-left.svg";
export { default as PanelLeftFilledIcon } from "./panel-left-filled.svg";

/** Pinned and not, on the same principle as the panel pair above. */
export { default as PinOutlineIcon } from "./pin.svg";
export { default as PinFilledIcon } from "./pin-filled.svg";

/** The plus at 24/1.6, for the import drop zone, where it's drawn at 28px and
 *  the rail's hairline plus would vanish. */
export { default as PlusLargeIcon } from "./plus-large.svg";
