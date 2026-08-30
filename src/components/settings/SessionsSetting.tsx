import { Suspense } from "react";
import { getSession } from "@/lib/auth/require-auth";
import { listSessions } from "@/lib/auth/session-store";
import { describeDevice, deviceKind } from "@/lib/auth/user-agent";
import { SessionsTable, type SessionRow } from "./SessionsTable";

/**
 * Access's second row: the signed-in devices. Suspended — a Neon round trip
 * that the free password row above shouldn't wait behind. The skeleton holds
 * one device's height.
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
 * The rows, flattened for the browser. [getSession] is free here (cached from
 * `requireAuth`) and names the current session. A device's own `label` beats
 * its user-agent description.
 */
async function Sessions() {
  const [records, current] = await Promise.all([listSessions(), getSession()]);

  const rows: SessionRow[] = records.map((record) => ({
    id: record.id,
    device: record.label ?? describeDevice(record.createdUserAgent),
    // From the user agent even for a renamed device — the shape isn't theirs
    // to choose.
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
 * The table's real headings over one dashed row, so nothing below it shifts
 * when the answer lands.
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
          {/* The action column, empty — present so column widths don't shift
              at the swap. */}
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
          {/* No dash under the buttons — that column never holds a fact. */}
          <td className="py-1.5" />
        </tr>
      </tbody>
    </table>
  );
}
