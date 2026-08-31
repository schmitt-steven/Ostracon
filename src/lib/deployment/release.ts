import "server-only";
import { version as nextVersion } from "next/package.json";
import { version as appVersion } from "../../../package.json";
import { describeRegion, type Region } from "./regions";

/**
 * What this copy of the app is, read from its environment — free (Vercel sets
 * these variables), so it renders on the first pass. The costly facts (DB
 * size, blob store) live in [services]. Off Vercel almost none of it is set
 * and the section says "Local".
 */

/**
 * Where this copy runs. "development" is `vercel dev` (platform emulator);
 * "local" is plain `next dev` (no platform).
 */
export type DeployTarget = "production" | "preview" | "development" | "local";

export const TARGET_LABEL: Record<DeployTarget, string> = {
  production: "Production",
  preview: "Preview",
  development: "Development",
  local: "Local",
};

export type Release = {
  /**
   * This build's Ostracon version, straight from `package.json`. Bumped by
   * hand when a change is one people running a copy should take — it is what
   * [checkForUpdate] compares against upstream to answer "is there an update".
   */
  version: string;
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
 * A function, not a constant — `VERCEL_REGION` is set per invocation.
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
    version: appVersion,
    target,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    region: region ? describeRegion(region) : null,
    commit: sha
      ? {
          sha,
          short: sha.slice(0, 7),
          ref: process.env.VERCEL_GIT_COMMIT_REF || null,
          // Subject line only — Vercel passes the whole message.
          message:
            process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0]?.trim() ||
            null,
          url: repoUrl && host ? `${repoUrl}/${host.commit}/${sha}` : null,
        }
      : null,
    // Written in full, not destructured — the build substitutes this literal.
    builtAt: process.env.BUILD_TIME || null,
    runtime: { next: nextVersion, node: process.version.replace(/^v/, "") },
  };
}
