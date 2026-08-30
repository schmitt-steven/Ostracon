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
 * Deployment — read-only facts about the running build: commit, region,
 * runtime, and where the data is kept. A server component slotted into
 * [SettingsView] so the connection string and blob token never reach a client
 * bundle. Release facts render immediately; storage figures (two round trips,
 * one walking the whole blob store) stream in behind a same-height skeleton.
 */
export function DeploymentSection() {
  const release = describeRelease();

  return (
    <div className="flex flex-col gap-4">
      {release.target === "local" ? (
        // Said once — off-platform most of these variables don't exist.
        <SectionNote>
          Not on Vercel, so this build has no release of its own.
        </SectionNote>
      ) : null}

      <Group label="Release">
        <Fact label="Environment">{TARGET_LABEL[release.target]}</Fact>

        {/* Branch shown as the hint only off production, where it's the one
            readable thing telling two preview deploys apart. */}
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

        {/* "Function region", not "Region" — the page names two regions. */}
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

/** Where the notes and images are kept, and how much of each. Behind Suspense. */
async function Storage() {
  const database = describeDatabase();
  const store = describeBlobStore();
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

      {/* Neon's endpoint id — an identifier you paste into a dashboard. */}
      <Fact label="Endpoint">
        {database.endpoint ? (
          <span className="font-mono">{database.endpoint}</span>
        ) : (
          <Unknown />
        )}
      </Fact>

      {/* "Database size", not "Size" — the group holds two things with sizes. */}
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

/** The same six rows, empty — kept exactly as tall as [Storage] replaces it. */
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

/** A region said both ways: `fra1 · Frankfurt` (city omitted when not on file). */
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
      <p className="text-[11px] uppercase tracking-wider text-ink-faint">
        {label}
      </p>
      <dl className="mt-[var(--space-item)] flex flex-col gap-[var(--space-item)]">
        {children}
      </dl>
    </div>
  );
}

/** One fact: name on the left, value against the right edge, baseline-aligned. */
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

/** No such fact here — a dash for the eye, "Not available" for screen readers. */
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
