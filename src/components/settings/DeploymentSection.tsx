import { Suspense, type ReactNode } from "react";
import { LocalDate } from "@/components/ui/LocalDate";
import { RelativeDate } from "@/components/ui/RelativeDate";
import type { Region } from "@/lib/deployment/regions";
import { describeRelease, TARGET_LABEL } from "@/lib/deployment/release";
import {
  blobStats,
  databaseStats,
  describeBlobStore,
  describeDatabase,
  formatBytes,
} from "@/lib/deployment/services";
import { SectionNote } from "./SectionNote";

/**
 * Deployment — the one section of settings with nothing to set.
 *
 * Everything above it answers "what do you want"; this answers "what is this".
 * Which build am I looking at, when did it go out, where is it running, where
 * is my writing actually kept, and how much of it is there — the questions you
 * ask when something looks wrong, or when you come back after a month and want
 * to know whether the thing you deployed is the thing you're using.
 *
 * **It is read-only on purpose.** None of it could be a control: the commit is
 * decided by a push, the region by the platform, the size by the notes. A page
 * of facts sitting under four pages of switches needs no explaining as long as
 * it looks like facts — hence rows of label-and-value throughout, and nothing
 * anywhere in it that could be mistaken for something to press. The one link
 * is the commit itself, inside the row that names it, because a commit hash is
 * only useful if you can go and read it.
 *
 * **Two speeds, one layout.** The release facts are read out of environment
 * variables and cost nothing, so they go out with the first byte. The storage
 * figures are two network round trips — one of which walks the entire blob
 * store — and nothing else on this page should wait behind them, so they
 * stream in under a placeholder built from the same rows. The skeleton is not
 * decoration: it holds the exact height the answers will need, so Danger zone
 * and the end of the page don't shift under the reader a beat after they land.
 *
 * A server component, passed into [SettingsView] as a slot rather than as
 * data. The connection string and the blob token are read to describe them,
 * and the surest way for neither to end up in a client bundle is for the code
 * that touches them never to be in one.
 */
export function DeploymentSection() {
  const release = describeRelease();

  return (
    <div className="flex flex-col gap-4">
      {release.target === "local" ? (
        // Said once, at the top, rather than left for the reader to infer from
        // a column of dashes. Off the platform most of these variables simply
        // do not exist — that is the answer, not a failure to look them up.
        <SectionNote>
          Not on Vercel, so this build has no release of its own.
        </SectionNote>
      ) : null}

      <Group label="Release">
        <Fact label="Environment">{TARGET_LABEL[release.target]}</Fact>

        {/* Named for what it is rather than for what it stands in for: the
            value is a short SHA, the link goes to the commit, the tooltip is
            its subject line, and "Runtime" three rows down holds the only
            actual version numbers on the page.

            The branch goes under the hash, but only where a branch can be a
            surprise. On a preview it is the one human-readable thing telling
            two deploys apart — the URL is a hash and so is the commit. On
            production it is the production branch by definition, and a hint
            that always reads the same trains the eye to skip hints, which is
            attention the deployment id under Region needs. */}
        <Fact
          label="Commit"
          hint={
            release.target === "production"
              ? undefined
              : (release.commit?.ref ?? undefined)
          }
        >
          {release.commit ? (
            release.commit.url ? (
              <a
                href={release.commit.url}
                target="_blank"
                rel="noopener noreferrer"
                // The message as the tooltip rather than as a line of its own:
                // a subject line is as long as its author felt like making it,
                // and this column has a right edge.
                title={release.commit.message ?? undefined}
                className="font-mono text-action underline-offset-2 hover:underline"
              >
                {release.commit.short}
              </a>
            ) : (
              <span className="font-mono">{release.commit.short}</span>
            )
          ) : (
            <Unknown />
          )}
        </Fact>

        <Fact label="Built">
          {release.builtAt ? (
            <>
              <LocalDate
                date={release.builtAt}
                options={{ dateStyle: "medium", timeStyle: "short" }}
              />{" "}
              <RelativeDate
                date={release.builtAt}
                long
                className="text-ink-faint"
              />
            </>
          ) : (
            <Unknown />
          )}
        </Fact>

        {/* "Function region" rather than "Region", for the reason "Database
            size" isn't "Size": this page names two regions, and once the
            functions sit next to the database both read `fra1 · Frankfurt`,
            so the label is the only thing telling them apart. "Function" is
            also the word the Vercel project settings use for the one you can
            actually change. */}
        <Fact label="Function region" hint={release.deploymentId ?? undefined}>
          {release.region ? (
            <RegionText region={release.region} />
          ) : (
            <Unknown />
          )}
        </Fact>

        <Fact label="Runtime">
          Next.js {release.runtime.next} · Node {release.runtime.node}
        </Fact>
      </Group>

      <Suspense fallback={<StorageSkeleton />}>
        <Storage />
      </Suspense>
    </div>
  );
}

/**
 * Where the notes and the images actually are, and how much of each.
 *
 * Async, and behind the Suspense boundary above: the identity half is free but
 * it is shown beside the figures it belongs to, and splitting the group in two
 * so half of it could arrive early would buy a few milliseconds at the cost of
 * a group that reflows while you read it.
 */
async function Storage() {
  const database = describeDatabase();
  const store = describeBlobStore();
  // Together rather than in sequence: one is Neon, the other is the blob API,
  // and neither has anything to say to the other.
  const [stats, blobs] = await Promise.all([databaseStats(), blobStats()]);

  return (
    <Group label="Storage">
      <Fact label="Database">
        {database.host ? (
          <>
            Neon
            {database.region ? (
              <>
                {" · "}
                <RegionText region={database.region} />
              </>
            ) : null}
          </>
        ) : (
          <Unknown />
        )}
      </Fact>

      {/* Which compute inside that region is actually being talked to —
          `ep-cool-name-a1b2c3`, Neon's own id for it. A row of its own rather
          than a second line under Database, because it is the same kind of
          thing as the blob store id four rows down: an identifier you copy
          into a dashboard or a support thread, and the one string that tells
          two Neon projects apart when both say `eu-central-1 · Frankfurt`.
          Monospaced for that reason, as every identifier on this page is. */}
      <Fact label="Endpoint">
        {database.endpoint ? (
          <span className="font-mono">{database.endpoint}</span>
        ) : (
          <Unknown />
        )}
      </Fact>

      {/* Named in full and standing directly under the database it measures.
          On its own, one row below a version number and one row above a blob
          store that has a size of its own, "Size" was a figure with no subject
          — and this group holds two things that have sizes. */}
      <Fact label="Database size">
        {stats.ok ? formatBytes(stats.value.sizeBytes) : <Unavailable />}
      </Fact>

      <Fact label="Postgres version">
        {stats.ok ? stats.value.serverVersion : <Unavailable />}
      </Fact>

      <Fact label="Blob store id">
        {store ? <span className="font-mono">{store}</span> : <Unknown />}
      </Fact>

      <Fact label="Blobs">
        {blobs.ok ? (
          `${blobs.value.count} files · ${formatBytes(blobs.value.sizeBytes)}`
        ) : (
          <Unavailable />
        )}
      </Fact>
    </Group>
  );
}

/**
 * The same six rows with nothing in them yet.
 *
 * Written out rather than generated from a shared list, because the point of
 * it is to be exactly as tall as what replaces it — and a shared list is a
 * thing you can edit one half of.
 */
function StorageSkeleton() {
  return (
    <Group label="Storage">
      {[
        "Database",
        "Endpoint",
        "Database size",
        "Postgres version",
        "Blob store id",
        "Blobs",
      ].map((label) => (
        <Fact key={label} label={label}>
          <Pending />
        </Fact>
      ))}
    </Group>
  );
}

/**
 * A region, said both ways at once: `fra1 · Frankfurt`.
 *
 * The code is what the platform calls the place and the city is what it is,
 * and dropping either would cost something real — the code alone means nothing
 * until you already know it, and the city alone is not what you type into a
 * dashboard or paste into a support thread. So both, with the code set in the
 * monospaced face the commit hash and the store id use, which is this page's
 * way of saying "this string is an identifier, copy it exactly".
 *
 * A code with no city on file prints on its own rather than inventing one.
 */
function RegionText({ region }: { region: Region }) {
  return (
    <>
      <span className="font-mono">{region.code}</span>
      {region.city ? ` · ${region.city}` : null}
    </>
  );
}

/** A named run of facts — the section's own subheading, one step down. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      {/* The palette preview's caption, at the same size and weight: both are
          a small word naming the block under it, and there is supposed to be
          one of those, not two. */}
      <p className="text-[11px] uppercase tracking-wider text-ink-faint">
        {label}
      </p>
      <dl className="mt-[var(--space-item)] flex flex-col gap-[var(--space-item)]">
        {children}
      </dl>
    </div>
  );
}

/**
 * One fact: its name on the left, its value against the right edge.
 *
 * Baseline-aligned rather than centred, so a value that happens to be a link
 * or a monospaced id still sits on the same line as its label instead of a
 * pixel above it. `justify-between` with no rule between the two is enough to
 * read as a table — the eye supplies the leader.
 */
function Fact({
  label,
  hint,
  children,
}: {
  label: string;
  /** A second, quieter line under the value — a branch, a count, an endpoint. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      {/* Right-aligned in both states: below about 340px of column the value
          wraps onto its own line, and keeping it against the right edge there
          keeps the column of answers a column. */}
      <dd className="min-w-0 text-right text-[13px] text-ink">
        <span className="block truncate">{children}</span>
        {hint ? (
          <span className="block truncate text-[12px] text-ink-faint">
            {hint}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * There is no such fact here — a local build has no commit, no region.
 *
 * The dash is for the eye only. An em dash read out is "em dash", which in a
 * list of answers is worse than silence, so the reason is spelled out beside
 * it for anything that isn't looking at the page.
 */
function Unknown() {
  return (
    <span className="text-ink-faint">
      <span aria-hidden>—</span>
      <span className="sr-only">Not available</span>
    </span>
  );
}

/** There is such a fact, but the service didn't answer. */
function Unavailable() {
  return <span className="text-ink-faint">Unavailable</span>;
}

/** The answer is on its way. */
function Pending() {
  return (
    <span aria-hidden className="text-ink-faint">
      —
    </span>
  );
}
