export type Theme = "light" | "dark";

/**
 * What the reader chose. "system" is "keep following the OS", not a third
 * palette — painting code resolves it to a [Theme] first.
 */
export type ThemePreference = Theme | "system";

const STORAGE_KEY = "skb:theme";
const OS_DARK_QUERY = "(prefers-color-scheme: dark)";

/** The switcher's segments. System leads — it's the default and the other two
 * are what it picks between. */
export const THEME_PREFERENCES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Runs synchronously in <head> before first paint, correcting `data-theme` on
 * <html> from the stored choice (the anti-FOUC pattern in
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 * Resolves the OS preference itself so `data-theme` is always explicit. First
 * paint only — [ThemeSync] owns changes after that. Must stay in step with
 * resolvePreference(); ships as text, hence longhand.
 */
export const THEME_INIT_SCRIPT = `{try{var s=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});document.documentElement.setAttribute("data-theme",s==="dark"||s==="light"?s:(window.matchMedia(${JSON.stringify(
  OS_DARK_QUERY,
)}).matches?"dark":"light"))}catch(e){}}`;

/**
 * The stored choice; "system" when there's no key or an unrecognised one
 * ("system" is stored as the absence of a key).
 */
export function storedPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Storage unavailable (private mode) — falls back to sessionPreference.
  }
  return sessionPreference ?? "system";
}

// The choice made this page load, for when storage is unavailable — otherwise
// the switcher would paint a theme but show the old segment selected.
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
 * Records a choice and paints what it resolves to. "system" clears the key
 * rather than writing "system", so the choice means *follow the OS*.
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
 * Calls back whenever the theme might have moved: OS palette change, another
 * tab's stored choice, or this tab's switcher. Callbacks re-read rather than
 * carrying deltas, so it drives [useSyncExternalStore] directly. Returns its
 * own undo.
 */
export function subscribeToTheme(onChange: () => void): () => void {
  const query = window.matchMedia(OS_DARK_QUERY);
  query.addEventListener("change", onChange);
  // "storage" fires only in other tabs — hence the listener set too.
  window.addEventListener("storage", onChange);
  listeners.add(onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    listeners.delete(onChange);
  };
}
