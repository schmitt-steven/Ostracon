import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { AppShell } from "@/components/shell/AppShell";
import { InlineScript } from "@/components/ui/InlineScript";
import { ThemeSync } from "@/components/ui/ThemeSync";
import { isAuthenticated } from "@/lib/auth/require-auth";
import {
  listNotesOverview,
  listPinnedNotes,
  toLite,
} from "@/lib/notes/queries";
import { buildTagTree, flattenTree } from "@/lib/tags/tree";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

// The app's visual signature: every note title and every index row title is
// set in this, in both views. `opsz` keeps it from going spindly at the 16px
// the index rows use.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ostracon",
  description: "Personal software-engineering notes",
  // The name an installed window carries, as distinct from the page title.
  applicationName: "Ostracon",
  appleWebApp: {
    capable: true,
    title: "Ostracon",
    // The page runs *under* the status bar rather than below it, which is what
    // makes an installed app look like one — and what makes the safe-area
    // insets in globals.css load-bearing rather than decorative.
    statusBarStyle: "black-translucent",
  },
  // Nothing here is a phone number; iOS deciding otherwise turns note text
  // blue and tappable.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw into the notch and the home-indicator strip. Everything that then has
  // to keep out of them does it with env(safe-area-inset-*) — see .shell-inset
  // and .bar-inset in globals.css.
  viewportFit: "cover",
  // The keyboard shortens the layout viewport instead of sliding it, so the
  // touch bottom bar lands above the keyboard rather than behind it.
  interactiveWidget: "resizes-content",
  // No themeColor here on purpose: Next writes it as prefers-color-scheme
  // media queries, and the OS preference is the thing a reader who chose light
  // or dark by hand has overridden. lib/theme.ts owns the tag instead, and
  // moves it with `data-theme`.
};

/**
 * The sidebar's contents, built once per render of the shell.
 *
 * Loaded in the layout rather than in each page because the sidebar is the same
 * on all of them — and because a tag tree assembled per route would flicker
 * its counts on every navigation as each page recomputed it.
 */
async function loadSidebar() {
  // Two reads rather than one filtered pass over the overview: see
  // [listPinnedNotes] for why the pins are asked for separately, and they are
  // asked for at the same time so the pair costs one round trip's worth of
  // waiting rather than two.
  const [all, pinnedNotes] = await Promise.all([
    listNotesOverview(),
    listPinnedNotes(),
  ]);
  const notes = all.map(toLite);
  const tree = buildTagTree(notes);
  const flat = flattenTree(tree);
  return {
    sidebar: {
      pinnedNotes,
      tree,
      tagCount: flat.length,
      allCount: notes.length,
      // Counted across notes rather than by listing the bucket: the same
      // markdown pasted into two notes points at one image, and the gallery
      // shows it once. See the note on the sidebar's row for where this and the
      // gallery can disagree.
      imageCount: new Set(all.flatMap((note) => note.imageUrls)).size,
    },
    tagNames: flat.map((node) => node.name),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The shell wraps /login too, so it has to know: a sidebar full of tags
  // behind a login form would be both wrong and a leak.
  const signedIn = await isAuthenticated();
  const shell = signedIn ? await loadSidebar() : null;

  return (
    <html
      lang="en"
      // The light palette is what the server can safely assume; the scripts
      // below correct it during parsing when the reader's is dark, which is a
      // DOM change React would otherwise flag as a hydration mismatch.
      data-theme="light"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      {/* The shell sizes itself to the viewport and scrolls its content areas
          internally, so the document itself never scrolls. */}
      <body className="h-full overflow-hidden">
        {/* Draws nothing. It holds the attribute the script above set — see
            [ThemeSync] for the two ways it can go stale — and it sits out here
            rather than inside the shell because /login is drawn without one. */}
        <ThemeSync />
        {/* Also out here rather than in the shell: /login is the page an
            installed app opens against a cold cache, and its assets are worth
            storing like any other. */}
        <ServiceWorkerRegistrar />
        {shell ? (
          <AppShell sidebar={shell.sidebar} tagNames={shell.tagNames}>
            {children}
          </AppShell>
        ) : (
          <main className="flex h-full flex-col overflow-y-auto">
            {children}
          </main>
        )}
      </body>
    </html>
  );
}
