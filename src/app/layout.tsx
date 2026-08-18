import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { InlineScript } from "@/components/ui/InlineScript";
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
  title: "SE Knowledge Base",
  description: "Personal software-engineering notes",
};

/**
 * The rail's contents, built once per render of the shell.
 *
 * Loaded in the layout rather than in each page because the rail is the same
 * on all of them — and because a tag tree assembled per route would flicker
 * its counts on every navigation as each page recomputed it.
 */
async function loadRail() {
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
    rail: {
      pinnedNotes,
      tree,
      tagCount: flat.length,
      allCount: notes.length,
      untaggedCount: notes.filter((note) => note.tags.length === 0).length,
      // Counted across notes rather than by listing the bucket: the same
      // markdown pasted into two notes points at one image, and the gallery
      // shows it once. See the note on the rail's row for where this and the
      // gallery can disagree.
      imageCount: new Set(all.flatMap((note) => note.imageUrls)).size,
    },
    tagNames: flat.map((node) => node.name),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The shell wraps /login too, so it has to know: a rail full of tags behind
  // a login form would be both wrong and a leak.
  const signedIn = await isAuthenticated();
  const shell = signedIn ? await loadRail() : null;

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
      {/* The shell sizes itself to the viewport and scrolls its panes
          internally, so the document itself never scrolls. */}
      <body className="h-full overflow-hidden">
        {shell ? (
          <AppShell rail={shell.rail} tagNames={shell.tagNames}>
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
