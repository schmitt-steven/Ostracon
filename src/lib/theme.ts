export type Theme = "light" | "dark";

const STORAGE_KEY = "skb:theme";
const OS_DARK_QUERY = "(prefers-color-scheme: dark)";

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
 * always an explicit answer and the dark palette needs stating only once.
 *
 * Kept in step with resolveTheme() below — the two must agree, or the toggle
 * would disagree with what the reader is looking at. Written out longhand
 * because it ships as text, not as compiled TypeScript.
 */
export const THEME_INIT_SCRIPT = `{try{var s=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});document.documentElement.setAttribute("data-theme",s==="dark"||s==="light"?s:(window.matchMedia(${JSON.stringify(
  OS_DARK_QUERY,
)}).matches?"dark":"light"))}catch(e){}}`;

function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The theme
    // still switches, it just won't outlive the page.
    return null;
  }
}

/** The theme to show absent any interaction: the stored choice, else the OS. */
export function resolveTheme(): Theme {
  return (
    storedTheme() ??
    (window.matchMedia(OS_DARK_QUERY).matches ? "dark" : "light")
  );
}

/** What's on screen right now — the attribute is the source of truth. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * `persist` is false for re-applying a theme the reader never picked (see
 * ThemeToggle): writing it to storage would silently pin them to whatever the
 * OS happened to be on that visit, and they'd stop following it afterwards.
 */
export function applyTheme(theme: Theme, { persist = true } = {}) {
  document.documentElement.setAttribute("data-theme", theme);
  if (!persist) return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // See storedTheme().
  }
}
