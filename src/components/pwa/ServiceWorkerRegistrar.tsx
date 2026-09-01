"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js. Draws nothing.
 *
 * Mounted in the root layout rather than in the shell, so it runs on /login
 * too — the sign-in page is the one an installed app opens against a cold
 * cache, and it wants its assets stored like any other.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /**
     * Never in development. The worker serves /_next/static cache-first on the
     * premise that those URLs are content-hashed, which holds for a build but
     * not for `next dev`: Turbopack reuses one chunk URL and pushes edits over
     * HMR, so the first stylesheet cached is the only one ever served. Tear
     * down whatever an earlier run left installed, since a registered worker
     * outlives the guard that stops it being registered again.
     */
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
        .then(() => caches.keys())
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      return;
    }

    /**
     * The build stamp doubles as the worker's cache tag.
     *
     * A worker is only replaced when its script *URL or bytes* change, and
     * sw.js is a static file whose bytes don't move between deploys — so the
     * query is what makes a new deploy install a new worker, and the worker
     * reads the same value back out of its own location to name (and sweep)
     * its caches. See next.config.ts for where BUILD_TIME comes from.
     */
    const build = process.env.BUILD_TIME ?? "dev";

    void navigator.serviceWorker.register(
      `/sw.js?v=${encodeURIComponent(build)}`,
      // `none`: never let the HTTP cache answer for the worker script itself.
      // The matching Cache-Control lives in next.config.ts.
      { scope: "/", updateViaCache: "none" },
    );
  }, []);

  return null;
}
