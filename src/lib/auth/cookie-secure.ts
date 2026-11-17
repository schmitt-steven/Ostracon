/**
 * Whether the session cookie gets the `Secure` flag.
 *
 * Browsers drop `Secure` cookies set over plain `http://` (except on
 * localhost), so always setting it would make login silently fail on a
 * self-hosted install reached as `http://my-nas:3000`. Never setting it would
 * send the session over plain HTTP whenever someone types `http://`.
 *
 * - On Vercel the flag is always set and `COOKIE_SECURE` is ignored: every
 *   request is HTTPS, and there's no setting there that could only weaken it.
 * - Elsewhere `COOKIE_SECURE` decides:
 *   - `auto` (default): secure when the request came in over HTTPS. Next.js
 *     fills in `x-forwarded-proto` itself when no proxy did, so this works
 *     both directly and behind a reverse proxy that sets the header.
 *   - `true`: always, for a proxy that terminates HTTPS without passing on
 *     the scheme.
 *   - `false`: never.
 *
 * Kept free of imports so it can be checked outside Next.js.
 */

type Env = Record<string, string | undefined>;

let warnedAbout: string | undefined;

export function isSecureCookie(
  env: Env,
  forwardedProto: string | null | undefined,
): boolean {
  if (env.VERCEL) return true;

  const setting = (env.COOKIE_SECURE ?? "auto").trim().toLowerCase();
  if (setting === "true") return true;
  if (setting === "false") return false;
  if (setting !== "auto" && setting !== "" && warnedAbout !== setting) {
    warnedAbout = setting;
    console.warn(
      `COOKIE_SECURE=${env.COOKIE_SECURE} isn't auto, true or false; using auto.`,
    );
  }

  // A chain of proxies may send "https, http"; the first entry is the
  // client-facing hop. A client can only forge this for its own cookie.
  const proto = forwardedProto?.split(",")[0]?.trim().toLowerCase();
  return proto === "https";
}
