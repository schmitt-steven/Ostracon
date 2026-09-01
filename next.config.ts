import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Uploads live in Vercel Blob, on a store-specific subdomain. Scoped to
    // the prefix the upload route writes under so the optimizer can't be
    // pointed at arbitrary blobs, and `search: ""` keeps signed/query-string
    // variants out.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
        port: "",
        pathname: "/notes/**",
        search: "",
      },
    ],
  },
  env: {
    /**
     * When this build was made, for the Deployment section of settings.
     *
     * Vercel exposes a great deal about a deployment and not one variable
     * saying when it happened, so the build stamps itself. `env` is the only
     * mechanism that can: values here are substituted into the bundles as
     * literals at build time, which is exactly the moment being recorded — a
     * real environment variable would be read at request time and tell you
     * about the cold start instead.
     *
     * In `next dev` this is when the dev server started, which is the closest
     * thing to a build time a dev server has.
     */
    BUILD_TIME: new Date().toISOString(),
  },
  turbopack: {
    /**
     * `src/icons/*.svg` are imported as React components, not as URLs.
     *
     * They have to be, because every glyph in this app is drawn in
     * `currentColor` and takes its colour from the row it sits in — a sidebar
     * row that goes from `--ink-muted` to `--ink` on hover, a chip whose ✕ is
     * `--ink-faint` until you're over it. An `<img src="/icons/tag.svg">` is a
     * separate document: `currentColor` there resolves against *its* root, not
     * against ours, so every one of those states would flatten to one fixed
     * colour. SVGR inlines the markup into the page instead, where the
     * cascade still reaches it — and the file on disk stays an ordinary `.svg`
     * that opens in any editor.
     *
     * `as: "*.js"` tells Turbopack the loader hands back a module rather than
     * an asset. Turbopack runs both `next dev` and `next build` as of 16, so
     * this is the only bundler config needed; there is no webpack half.
     */
    rules: {
      "*.svg": {
        loaders: [
          {
            loader: "@svgr/webpack",
            // SVGO is off on purpose. These paths were drawn by hand against a
            // 16 (or 12, or 24) box with deliberate sub-pixel positions, and
            // the optimiser's path-merging rewrites coordinates it considers
            // equivalent. It isn't worth a re-rounded curve to save bytes on
            // twenty glyphs that total under 4KB.
            options: { svgo: false, ref: false, memo: true },
          },
        ],
        as: "*.js",
      },
    },
  },
  async headers() {
    return [
      {
        // The one file the browser must never serve from its own HTTP cache.
        // `updateViaCache: "none"` at registration covers the same ground from
        // the other side; a stale worker is the failure mode that outlives a
        // deploy, so both ends say it.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    /**
     * A dropped connection stops throwing. Failed navigations, RSC fetches,
     * prefetches and Server Actions stay pending and retry themselves once the
     * network is back, and `useOffline` from next/offline reports the state.
     *
     * Works without Cache Components because there is a route-level
     * app/loading.tsx to prefetch as the shell — see the offline-support guide
     * in node_modules/next/dist/docs.
     *
     * Note what this changes: a Server Action that fails on the network no
     * longer rejects, so use-autosave's "error" branch stops firing for
     * offline saves and the hint sits pending instead. That is why the save
     * hint reads the offline state (see SaveHint).
     */
    useOffline: true,
  },
};

export default nextConfig;
