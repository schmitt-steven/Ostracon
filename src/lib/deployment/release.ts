import "server-only";
import { version as nextVersion } from "next/package.json";
import { describeRegion, type Region } from "./regions";

/**
 * What this particular copy of the app is — read out of the environment it was
 * started in.
 *
 * Everything here is free: Vercel sets these variables on the build and on the
 * running function, so describing a release costs no network call and can be
 * rendered on the first pass of the page. The things that *do* cost a call —
 * how big the database is, what's in the blob store — live in [services] and
 * arrive after.
 *
 * Off Vercel (a `next dev` on this laptop) almost none of it is set, and that
 * is a fact worth printing rather than an error: the section says "Local" and
 * shows the parts that are still true — the runtime versions, and whichever
 * database and blob store `.env.local` happens to point at, which for this
 * project are the real ones.
 */

/**
 * Where this copy is running. Vercel's own three, plus the one it has no word
 * for because it never sees it.
 *
 * "development" is `vercel dev` — the platform's local emulator, still fed by
 * the platform's environment. "local" is a plain `next dev`, where there is no
 * platform at all.
 */
export type DeployTarget = "production" | "preview" | "development" | "local";

export const TARGET_LABEL: Record<DeployTarget, string> = {
  production: "Production",
  preview: "Preview",
  development: "Development",
  local: "Local",
};

export type Release = {
  target: DeployTarget;
  /** Vercel's id for this deployment; null anywhere else. */
  deploymentId: string | null;
  /** Where the function answering this request is running — `fra1`, Frankfurt. */
  region: Region | null;
  commit: {
    sha: string;
    /** The seven characters anybody actually quotes. */
    short: string;
    /** The branch it was built from, if the provider told us. */
    ref: string | null;
    /** Its subject line, for the link's tooltip. */
    message: string | null;
    /** A link to the commit at the provider, when the provider is one we can build a URL for. */
    url: string | null;
  } | null;
  /** ISO-8601, stamped into the bundle at build time — see next.config.ts. */
  builtAt: string | null;
  runtime: { next: string; node: string };
};

/** Where a commit and a repository live, per git host Vercel can deploy from. */
const GIT_HOSTS: Record<string, { repo: string; commit: string }> = {
  github: { repo: "https://github.com", commit: "commit" },
  gitlab: { repo: "https://gitlab.com", commit: "-/commit" },
  bitbucket: { repo: "https://bitbucket.org", commit: "commits" },
};

/**
 * Reads the environment as it stands right now.
 *
 * A function rather than a module-level constant: on Vercel, `VERCEL_REGION`
 * is set per invocation, and a constant computed when the module first loaded
 * would keep reporting the region of whichever cold start happened to
 * evaluate it.
 */
export function describeRelease(): Release {
  const onVercel = Boolean(process.env.VERCEL);
  const environment = process.env.VERCEL_ENV;

  const target: DeployTarget =
    !onVercel ||
    (environment !== "production" &&
      environment !== "preview" &&
      environment !== "development")
      ? "local"
      : environment;

  const sha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const provider = process.env.VERCEL_GIT_PROVIDER || "";
  const owner = process.env.VERCEL_GIT_REPO_OWNER || "";
  const slug = process.env.VERCEL_GIT_REPO_SLUG || "";
  const host = GIT_HOSTS[provider];
  const repoUrl = host && owner && slug ? `${host.repo}/${owner}/${slug}` : null;

  const region = process.env.VERCEL_REGION;

  return {
    target,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    region: region ? describeRegion(region) : null,
    commit: sha
      ? {
          sha,
          short: sha.slice(0, 7),
          ref: process.env.VERCEL_GIT_COMMIT_REF || null,
          // Only the subject line: Vercel passes the whole message, and a body
          // with four paragraphs in it is not a tooltip.
          message:
            process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0]?.trim() ||
            null,
          url: repoUrl && host ? `${repoUrl}/${host.commit}/${sha}` : null,
        }
      : null,
    // Written out in full rather than destructured off `process.env`: this one
    // is not an environment variable at runtime at all but a literal the build
    // substitutes in, and the substitution only finds the whole expression.
    builtAt: process.env.BUILD_TIME || null,
    runtime: { next: nextVersion, node: process.version.replace(/^v/, "") },
  };
}
