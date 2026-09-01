import type { MetadataRoute } from "next";

/**
 * What the OS is told about Ostracon when someone installs it. Served at
 * /manifest.webmanifest; the <link rel="manifest"> is emitted for us.
 *
 * Nothing request-shaped may be read in here — no cookies(), no requireAuth().
 * This is a Route Handler that Next caches at build time, and one touch of a
 * request-time API turns it dynamic. It is also fetched by Chrome with
 * `credentials: "omit"`, so it has to be reachable with no session at all:
 * see the matcher in src/proxy.ts.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ostracon",
    short_name: "Ostracon",
    description: "Personal software-engineering notes",
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // What to fall back to where standalone isn't offered — a slim browser
    // frame rather than a full tab strip.
    display_override: ["standalone", "minimal-ui"],
    // Both are --paper (light). The server renders data-theme="light", so the
    // splash hands over to first paint seamlessly; a dark reader gets the same
    // one-frame correction the anti-FOUC script in lib/theme.ts already makes.
    background_color: "#e6e8ec",
    theme_color: "#e6e8ec",
    categories: ["productivity"],

    icons: [
      // `any` keeps its alpha: the launcher and the tab composite the sherd
      // themselves, and its irregular silhouette is the whole identity.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // `maskable` is cropped to a circle covering the middle 80% of the
      // canvas, so this one is a separate drawing: the sherd inset to ~70% on
      // an opaque ink ground. Sharing one file between the two purposes would
      // either slice the silhouette off or float it in a tiny box.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],

    shortcuts: [
      { name: "New note", short_name: "New", url: "/notes/new" },
      // Search is the ⌘K search menu rather than a route — see SearchMenuLaunch
      // for the bridge that turns this query back into an open search menu.
      { name: "Search", short_name: "Search", url: "/?search=1" },
      { name: "All tags", short_name: "Tags", url: "/tags" },
    ],

    /**
     * Sharing a link or a selection from another app opens a prefilled note.
     *
     * GET, not POST, and that is load-bearing: the session cookie is
     * SameSite=Lax (lib/auth/actions.ts), and Lax cookies are withheld from a
     * top-level POST navigation. A POST share would arrive with no session,
     * get bounced to /login by the proxy, and lose what was shared. A GET
     * share is an ordinary top-level navigation, so the cookie rides along —
     * and it needs no route handler, only two more search params on the page
     * that already exists.
     */
    share_target: {
      action: "/notes/new",
      method: "get",
      params: { title: "title", text: "text", url: "url" },
    },

    /**
     * Opening .md files with Ostracon. The action is "/" rather than
     * /notes/new because a file becomes an *imported* note, one per file —
     * the flow NoteImport already owns, which is where the launch queue is
     * consumed. Chromium desktop only, and the association is registered when
     * the app is installed.
     */
    file_handlers: [
      {
        action: "/",
        accept: {
          "text/markdown": [".md", ".markdown"],
          "text/plain": [".txt"],
        },
      },
    ],
    // A file opened while the app is already running lands in the open window
    // instead of spawning a second one.
    launch_handler: { client_mode: "navigate-existing" },
  };
}
