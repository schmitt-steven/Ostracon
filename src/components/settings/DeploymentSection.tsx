import { Suspense, type ReactNode } from "react";
import { LocalDate } from "@/components/ui/LocalDate";
import { RelativeDate } from "@/components/ui/RelativeDate";
import type { Region } from "@/lib/deployment/regions";
import { describeRelease, TARGET_LABEL } from "@/lib/deployment/release";
import {
  databaseStats,
  describeDatabase,
  describeUploads,
  formatBytes,
  uploadStats,
  type DatabaseIdentity,
  type UploadsIdentity,
} from "@/lib/deployment/services";
import { SectionNote } from "./SectionNote";

/**
 * Deployment — read-only facts about the running build: commit, region,
 * runtime, and where the data is kept. A server component slotted into
 * [SettingsView] so the connection string and blob token never reach a client
 * bundle. Release facts render immediately; storage figures (two round trips,
 * one walking the whole blob store) stream in behind a same-height skeleton.
 *
 * Whether a *newer* version exists is not asked here — that's the sidebar's
 * [UpdateRow], where it can be seen without opening this page.
 */
export function DeploymentSection() {
  const release = describeRelease();
  // Read here, outside Suspense, so the skeleton has the same rows.
  const database = describeDatabase();
  const uploads = describeUploads();

  return (
    <div className="flex flex-col gap-4">
      {release.target === "local" ? (
        // Said once — off-platform most of these variables don't exist.
        <SectionNote>
          Not on Vercel, so this build has no release of its own.
        </SectionNote>
      ) : release.target === "docker" ? (
        <SectionNote>
          Running from the Docker image. Commit and region details only exist
          on Vercel.
        </SectionNote>
      ) : null}

      <Group label="Release">
        <Fact label="Version">{release.version}</Fact>

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
                className="text-ink-faint max-[480px]:hidden"
              />
            </>
          ) : (
            <Unknown />
          )}
        </Fact>

        {/* "Function region", not "Region" — the page names two regions.
            Left out in Docker, where there are no functions to place. */}
        {release.target === "docker" ? null : (
          <Fact
            label="Function region"
            hint={release.deploymentId ?? undefined}
          >
            {release.region ? (
              <RegionText region={release.region} />
            ) : (
              <Unknown />
            )}
          </Fact>
        )}

        <Fact label="Runtime">
          Next.js {release.runtime.next} · Node {release.runtime.node}
        </Fact>
      </Group>

      <Suspense
        fallback={<StorageSkeleton labels={storageLabels(database, uploads)} />}
      >
        <Storage database={database} uploads={uploads} />
      </Suspense>
    </div>
  );
}

/**
 * The Storage rows for this deployment, in order. Neon has an endpoint id to
 * show and a plain Postgres doesn't; a Blob store has an id and a folder has a
 * path. Shared with [StorageSkeleton] so the placeholder is exactly as tall
 * as what replaces it.
 */
function storageLabels(
  database: DatabaseIdentity,
  uploads: UploadsIdentity,
): string[] {
  return [
    "Database",
    ...(database.neon ? ["Endpoint"] : []),
    // "Database size", not "Size" — the group holds two things with sizes.
    "Database size",
    "Postgres version",
    ...(uploads.kind === "vercel-blob"
      ? ["Blob store id", "Blobs"]
      : uploads.kind === "local"
        ? ["Upload folder", "Uploads"]
        : ["Uploads"]),
  ];
}

/** Where the notes and images are kept, and how much of each. Behind Suspense. */
async function Storage({
  database,
  uploads,
}: {
  database: DatabaseIdentity;
  uploads: UploadsIdentity;
}) {
  const [stats, files] = await Promise.all([
    databaseStats(),
    uploads.kind === "none"
      ? Promise.resolve({ ok: false } as const)
      : uploadStats(),
  ]);

  const facts: Record<string, ReactNode> = {
    Database: database.host ? (
      database.neon ? (
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
        // A plain server: the host is the one thing worth naming — `db` in
        // the compose file, or wherever the URL points.
        <>
          Postgres · <span className="font-mono">{database.host}</span>
        </>
      )
    ) : (
      <Unknown />
    ),

    // Neon's endpoint id — an identifier you paste into a dashboard.
    Endpoint: database.endpoint ? (
      <span className="font-mono">{database.endpoint}</span>
    ) : (
      <Unknown />
    ),

    "Database size": stats.ok ? (
      formatBytes(stats.value.sizeBytes)
    ) : (
      <Unavailable />
    ),

    "Postgres version": stats.ok ? stats.value.serverVersion : <Unavailable />,

    "Blob store id":
      uploads.kind === "vercel-blob" && uploads.storeId ? (
        <span className="font-mono">{uploads.storeId}</span>
      ) : (
        <Unknown />
      ),

    // A path inside the server (in Docker, the volume's mount point).
    "Upload folder":
      uploads.kind === "local" ? (
        <span className="font-mono">{uploads.folder}</span>
      ) : (
        <Unknown />
      ),
  };

  const count = files.ok
    ? `${files.value.count} ${files.value.count === 1 ? "file" : "files"} · ${formatBytes(files.value.sizeBytes)}`
    : null;
  facts.Blobs = count ?? <Unavailable />;
  facts.Uploads = count ?? <Unavailable />;

  return (
    <Group label="Storage">
      {storageLabels(database, uploads).map((label) => (
        <Fact key={label} label={label}>
          {facts[label]}
        </Fact>
      ))}
    </Group>
  );
}

/** The same rows, empty — kept exactly as tall as [Storage] replaces it. */
function StorageSkeleton({ labels }: { labels: string[] }) {
  return (
    <Group label="Storage">
      {labels.map((label) => (
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
      <p className="text-meta uppercase tracking-wider text-ink-faint">
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
    <div className="flex items-baseline justify-between gap-x-4">
      <dt className="shrink-0 text-ui text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right text-ui text-ink">
        <span className="block truncate">{children}</span>
        {hint ? (
          <span className="block truncate text-meta text-ink-faint">
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
