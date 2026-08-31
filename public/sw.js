/**
 * Ostracon's service worker.
 *
 * It does two things, and deliberately not a third:
 *
 *   1. Serves /_next/static/* from the cache, so an installed app launches
 *      without re-downloading its own code and fonts.
 *   2. Falls back to /offline.html when a full page load can't reach the
 *      server, instead of the browser's error page.
 *
 * What it does *not* do is cache pages. Every route in this app is rendered
 * per request behind a session (see requireAuth), so there is no shell to keep
 * — and a cached page here would mean serving one reader's notes from disk
 * after their session ended. Navigations go to the network or to the fallback,
 * never to a stored copy.
 *
 * Written by hand rather than generated: this file has to stay correct across
 * however many independently-updated copies of Ostracon are running, and a
 * build plugin that fails takes every one of their deploys down with it.
 */

/**
 * Tagged onto every cache this build owns. Comes from the ?v= the registrar
 * appends (components/pwa/ServiceWorkerRegistrar) — a changed script URL is what makes the
 * browser install a new worker at all, so the same string can name what that
 * worker's caches are allowed to keep.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";

const ASSETS = `ostracon-assets-${VERSION}`;
const SHELL = `ostracon-shell-${VERSION}`;

const OFFLINE_URL = "/offline.html";

/**
 * The fallback page and everything it draws.
 *
 * The icon is on this list for a reason worth stating: it is not under
 * /_next/static, so without an entry here it would fall through to the network
 * — which is, by definition, the one thing that isn't there when the page it
 * belongs to is being shown. Precaching it and then not serving it from the
 * precache is the whole failure.
 */
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // `reload` so a fallback page cached by the *previous* worker can't be
      // handed straight back to this one by the HTTP cache.
      .then((cache) =>
        cache.addAll(
          PRECACHE.map((url) => new Request(url, { cache: "reload" })),
        ),
      )
      // Don't sit in `waiting` for every tab to close. Nothing this worker
      // serves is version-sensitive (see the note on immutability below), so
      // taking over immediately is safe and it keeps a bad worker from
      // outliving the deploy that replaced it.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !name.endsWith(`-${VERSION}`))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Anything that isn't a plain same-origin GET is somebody else's business:
  // Server Action POSTs, uploads, the AI stream, cross-origin blob images.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigateOrFallback(request));
    return;
  }

  /**
   * Cache-first, and safe to be: these URLs carry a content hash, so a stored
   * response can never be the wrong answer *for its own URL*. A build that
   * changes a chunk changes its name, and the old entry is dropped by the
   * `activate` sweep above rather than ever being served in its place.
   *
   * Everything else falls through untouched — /api/*, RSC payloads, and the
   * image optimiser are all either private, streaming, or already cached by
   * the browser on sensible terms.
   */
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  // The fallback's own furniture, from the copy stored at install. Not
  // content-hashed like the bundle is, so it leans on the `activate` sweep
  // instead: a new build means a new tag, which means a fresh precache.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL));
  }
});

async function navigateOrFallback(request) {
  try {
    return await fetch(request);
  } catch {
    // Network-level failure only — a 401, a redirect to /login, or a 500 all
    // resolve and are shown as themselves. This branch is "there is no
    // server", not "the server said no".
    const cached = await caches.match(OFFLINE_URL, { cacheName: SHELL });
    return (
      cached ??
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Opaque and error responses are not worth keeping; `ok` covers both.
  if (response.ok) cache.put(request, response.clone());
  return response;
}
