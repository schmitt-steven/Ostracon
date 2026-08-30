import { Suspense } from "react";
import { getSession } from "@/lib/auth/require-auth";
import { listSessions } from "@/lib/auth/session-store";
import { describeDevice, deviceKind } from "@/lib/auth/user-agent";
import { SessionsTable, type SessionRow } from "./SessionsTable";

/**
 * Access's second row: the devices that are signed in.
 *
 * Named at the same size as Password above it, because it is the same rank of
 * thing — a heading over a block rather than a caption under one. The column
 * headings inside the table are the small uppercase captions, so this line has
 * to be the larger of the two or the table would appear to be filed under its
 * own first column.
 *
 * Suspended, and the reason is worth stating: the query is a round trip to Neon
 * for a section that sits *above* Deployment, which is already streaming two
 * more. Without a boundary here the password row — which is free — would wait
 * behind a list of devices to be painted. The skeleton holds the height of one
 * device, which is the shortest the answer can be and the length it usually is.
 */
export function SessionsSetting() {
  return (
    <div>
      <p className="text-[15px] text-ink">Active sessions</p>
      <div className="mt-[var(--space-item)]">
        <Suspense fallback={<SessionsSkeleton />}>
          <Sessions />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The rows, read and flattened for the browser.
 *
 * Two reads, deliberately not one: the list, and the session doing the asking.
 * The second is [getSession], which the page has already called through
 * `requireAuth` and which is wrapped in React's `cache` — so it costs nothing
 * here and is guaranteed to name the same session the page was let in on.
 *
 * The flattening is where the label is chosen. A device the owner has named
 * beats one described from its user agent, because a user agent is a claim the
 * client makes and a name is something a person decided. Nothing sets `label`
 * yet; the column is there and this is the code that will honour it.
 */
async function Sessions() {
  const [records, current] = await Promise.all([listSessions(), getSession()]);

  const rows: SessionRow[] = records.map((record) => ({
    id: record.id,
    device: record.label ?? describeDevice(record.createdUserAgent),
    // From the user agent even when the owner has renamed the device: the
    // name is theirs to choose and the shape isn't, and a session called
    // "work laptop" should still be drawn as whatever actually holds the
    // cookie.
    kind: deviceKind(record.createdUserAgent),
    location: record.lastSeenLocation ?? record.createdLocation,
    ip: record.lastSeenIp ?? record.createdIp,
    createdAt: record.createdAt.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    current: record.id === current?.id,
  }));

  return <SessionsTable rows={rows} />;
}

/**
 * The table's own headings over one empty row.
 *
 * Headings rather than a grey box, because they are known before the query
 * runs and they are what tells the reader what is arriving. The row of dashes
 * under them is one line tall — the height the first device will take — so the
 * Deployment heading below doesn't step down the page a beat after it lands.
 */
function SessionsSkeleton() {
  return (
    <table aria-hidden className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-line">
          {["Device", "Location", "Created", "Last active"].map((label) => (
            <th
              key={label}
              className="whitespace-nowrap pb-[var(--space-item)] pr-6 text-left text-[11px] font-normal uppercase tracking-wider text-ink-faint last:pr-0"
            >
              {label}
            </th>
          ))}
          {/* The action column, empty. Present so the four that carry words
              are apportioned the same width they will have once the answer
              arrives — a skeleton one column narrower would resettle
              sideways at the swap, which is the flicker it exists to avoid. */}
          <th />
        </tr>
      </thead>
      <tbody>
        <tr>
          {["device", "location", "created", "lastActive"].map((key) => (
            <td key={key} className="py-1.5 pr-6 text-ink-faint">
              —
            </td>
          ))}
          {/* No dash under the buttons: a dash is a fact that isn't there
              yet, and the fifth column never holds one. */}
          <td className="py-1.5" />
        </tr>
      </tbody>
    </table>
  );
}
