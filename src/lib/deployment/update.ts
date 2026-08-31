import "server-only";

/**
 * Whether a newer Ostracon exists upstream.
 *
 * Ostracon updates by pulling commits from the repo it was forked from, so
 * "is there an update" is answered by reading that repo's `package.json` and
 * comparing its version to the one baked into this build. Nothing here can
 * *perform* an update: the check is read-only and unauthenticated, and the
 * only thing offered is a link to that version's release notes, which the
 * person then merges (or doesn't) on GitHub. See the README's Updating
 * section.
 *
 * Comparing versions rather than commits is deliberate. A fork's HEAD stops
 * matching upstream the moment its owner changes anything — a colour, a
 * config — and a check built on commit ids would call that "behind" forever.
 */

/** The repo this one is a copy of, and the branch releases land on. */
const UPSTREAM = {
  owner: "schmitt-steven",
  repo: "Ostracon",
  branch: "main",
} as const;

/** How long a check is reused. Updates are rare; the news can be a day stale. */
const REVALIDATE_SECONDS = 60 * 60 * 24;

/** GitHub can be slow or down, and neither should hold up the settings page. */
const TIMEOUT_MS = 5_000;

export type UpdateCheck =
  | { state: "current" }
  /**
   * Upstream is ahead: the version it's at, where that version is described,
   * and this copy's own repository — the one the person actually merges into,
   * when the platform told us which it is.
   */
  | {
      state: "behind";
      latest: string;
      /** What is running here — carried along so the dialog needn't be told. */
      current: string;
      releaseUrl: string;
      forkUrl: string | null;
    }
  /** Upstream couldn't be reached or didn't answer with a version. */
  | { state: "unknown" };

/** @param current this build's version — [describeRelease] reads it. */
export async function checkForUpdate(current: string): Promise<UpdateCheck> {
  const latest = await latestUpstreamVersion();
  if (!latest) return { state: "unknown" };

  if (compareVersions(latest, current) <= 0) return { state: "current" };

  return {
    state: "behind",
    latest,
    current,
    releaseUrl: releaseUrl(latest),
    forkUrl: forkUrl(),
  };
}

/**
 * Upstream's declared version, or null if it can't be had.
 *
 * `raw.githubusercontent.com` rather than the API: no token, no rate limit
 * worth thinking about, and the answer is the same file the build was cut
 * from. Cached for a day, so a deployment asks GitHub once regardless of how
 * often the page is opened.
 */
async function latestUpstreamVersion(): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${UPSTREAM.owner}/${UPSTREAM.repo}/${UPSTREAM.branch}/package.json`;

  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const manifest: unknown = await response.json();
    const version =
      manifest && typeof manifest === "object" && "version" in manifest
        ? manifest.version
        : null;

    return typeof version === "string" && version ? version : null;
  } catch {
    // Offline, blocked, timed out, not JSON — all the same answer: don't know.
    return null;
  }
}

/**
 * Where to send someone to see what they'd be taking.
 *
 * The tag page for that exact version, not the commit log: a version number is
 * meaningless against a list of commit subjects, which carry no versions. The
 * page exists for any pushed tag and gets a title and notes once a release is
 * published against it, so the link works from the moment the tag lands.
 *
 * This is what `npm version` is for — it bumps `package.json` and tags the
 * commit with a matching `v`-prefixed tag in one step, which is the only thing
 * keeping this URL and the version it came from in agreement.
 */
function releaseUrl(version: string): string {
  return `https://github.com/${UPSTREAM.owner}/${UPSTREAM.repo}/releases/tag/v${version}`;
}

/**
 * This copy's own repository on GitHub, for the instructions to link at.
 *
 * Vercel names the repo it deployed, which is the reader's fork rather than
 * ours. Null off Vercel and off GitHub, where there is nothing to point at and
 * the dialog says the step without linking it.
 */
function forkUrl(): string | null {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  if (process.env.VERCEL_GIT_PROVIDER !== "github" || !owner || !slug) {
    return null;
  }
  return `https://github.com/${owner}/${slug}`;
}

/**
 * Ordering for `major.minor.patch[-prerelease]` strings: positive when `a` is
 * newer. Missing numeric parts count as zero, and unparseable ones as zero
 * too — a version nobody can read is not grounds for telling someone to
 * update.
 *
 * Prereleases rank below the release they lead to, as semver says, so
 * `0.3.0-rc.1` upstream never nags anyone already on `0.3.0`, while `0.3.0`
 * upstream does reach someone still on `0.3.0-rc.1`. Identifiers are compared
 * as plain strings rather than by semver's field-by-field rules; the point is
 * only to order a handful of release candidates.
 */
function compareVersions(a: string, b: string): number {
  const split = (version: string) => {
    const [core = "", prerelease = ""] = version.split("+", 1)[0]!.split("-", 2);
    return {
      numbers: core.split(".").map((part) => Number.parseInt(part, 10) || 0),
      prerelease,
    };
  };

  const left = split(a);
  const right = split(b);

  for (
    let i = 0;
    i < Math.max(left.numbers.length, right.numbers.length);
    i += 1
  ) {
    const difference = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0);
    if (difference !== 0) return difference;
  }

  // Same numbers: the one without a prerelease tag is the finished one.
  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}
