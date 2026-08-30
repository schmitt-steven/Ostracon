export type Theme = "light" | "dark";

/**
 * What the reader has actually chosen, which is one more thing than what is on
 * screen: "system" is a standing instruction to keep following the OS rather
 * than a third palette. Everything that paints resolves it down to a [Theme]
 * first; only storage and the switcher deal in preferences.
 */
export type ThemePreference = Theme | "system";

const STORAGE_KEY = "skb:theme";
const OS_DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * The switcher's three segments, in the order they read. System leads because
 * it is the default and because the two beside it are what it chooses between
 * — a list that ran light, dark, system would put the general case last.
 */
export const THEME_PREFERENCES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Runs in <head>, synchronously, before the browser paints anything — the
 * pattern documented at
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
 * The server has no way to know the reader's theme, so it renders the light
 * default and this corrects <html> during parsing, ahead of both first paint
 * and hydration.
 *
 * It resolves the OS preference itself rather than leaving that to a
 * `prefers-color-scheme` media query in the stylesheet, so `data-theme` is
 * always an explicit answer and the dark palette needs stating only once. An
 * unset key — which is how "system" is stored — falls through to exactly that
 * branch, so following the OS costs nothing here.
 *
 * First paint is all it does. Keeping up with an OS that changes *while* the
 * page is open belongs to [ThemeSync], so there is one owner for that and not
 * two listeners setting the same attribute.
 *
 * Kept in step with resolvePreference() below — the two must agree, or the
 * switcher would disagree with what the reader is looking at. Written out
 * longhand because it ships as text, not as compiled TypeScript.
 */
export const THEME_INIT_SCRIPT = `{try{var s=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});document.documentElement.setAttribute("data-theme",s==="dark"||s==="light"?s:(window.matchMedia(${JSON.stringify(
  OS_DARK_QUERY,
)}).matches?"dark":"light"))}catch(e){}}`;

/**
 * The stored choice, "system" when there isn't one.
 *
 * "System" is the absence of a key rather than a value of its own: it is the
 * state the app starts in, and storing it would only be a second way of
 * writing down the default. Anything unrecognised — an older build's value, a
 * hand-edited entry — reads as system too, since following the OS is the safe
 * answer to "I don't know what this is".
 */
export function storedPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The theme
    // still switches, it just won't outlive the page — see below.
  }
  return sessionPreference ?? "system";
}

/**
 * What was chosen since the page loaded, for the one case storage can't cover:
 * where it is unavailable, this is the only record that a choice was made at
 * all, and without it the switcher would paint the new theme and then show the
 * old segment still selected — a control visibly refusing its own press.
 *
 * Never consulted while storage has an answer, and it agrees with storage
 * whenever storage works, so it can't disagree with what's on screen.
 */
let sessionPreference: ThemePreference | null = null;

/** What the OS is asking for right now. */
function systemTheme(): Theme {
  return window.matchMedia(OS_DARK_QUERY).matches ? "dark" : "light";
}

/** The palette a preference comes to — the stored one, unless told otherwise. */
export function resolvePreference(
  preference: ThemePreference = storedPreference(),
): Theme {
  return preference === "system" ? systemTheme() : preference;
}

/** Paints a palette without recording anything: the attribute is the display. */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Records a choice and paints what it resolves to.
 *
 * Choosing "system" clears the key rather than writing "system" into it, which
 * is what makes the choice mean *follow*, not "light, as it happens to be
 * right now" — the reader goes back to tracking their OS from that moment on,
 * including when it flips tonight.
 */
export function applyPreference(preference: ThemePreference) {
  applyTheme(resolvePreference(preference));
  sessionPreference = preference;
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // See storedPreference().
  }
  for (const listener of listeners) listener();
}

const listeners = new Set<() => void>();

/**
 * Calls back whenever the theme might have moved out from under whoever is
 * asking: the OS switching palettes, another tab of this app storing a
 * different choice, or this tab's own switcher being pressed. Returns its own
 * undo.
 *
 * All three are re-reads rather than deltas — a subscriber asks storage and
 * the OS what they say now — so an event that changed nothing is a no-op
 * rather than a wrong answer. That is also why the switcher can be driven
 * straight off this with [useSyncExternalStore] instead of keeping a copy of
 * the preference in React state that could drift from the stored one.
 */
export function subscribeToTheme(onChange: () => void): () => void {
  const query = window.matchMedia(OS_DARK_QUERY);
  query.addEventListener("change", onChange);
  // Fires only in the app's *other* tabs — hence the listener set as well, for
  // the tab that did the storing.
  window.addEventListener("storage", onChange);
  listeners.add(onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    listeners.delete(onChange);
  };
}
