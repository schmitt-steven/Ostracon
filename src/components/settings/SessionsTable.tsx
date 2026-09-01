"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { RelativeDate } from "@/components/ui/RelativeDate";
import {
  revokeSessionAction,
  type RevokeSessionResult,
} from "@/lib/auth/actions";
import type { DeviceKind } from "@/lib/auth/user-agent";
import { DesktopIcon, PhoneIcon, TrashIcon } from "@/icons";

/**
 * One signed-in device, flattened for the client boundary: plain strings, dates
 * as ISO. Built by [SessionsSetting].
 */
export type SessionRow = {
  id: string;
  /** `Safari on iPhone`, the owner's own name for it, or null when neither. */
  device: string | null;
  /** Which glyph stands beside the name — see [deviceKind]. Null draws none. */
  kind: DeviceKind | null;
  /** `Frankfurt, Germany`, or null off-platform — see lib/auth/geo. */
  location: string | null;
  /** Where it was last seen from. The location's evidence, and its fallback. */
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  /** The device you're reading this on. Named, and signing it out logs out. */
  current: boolean;
};

/**
 * The devices holding a valid cookie, and the control to revoke one. Scrolls
 * sideways rather than reflowing; nothing wraps or ellipsises. The current
 * device is named and can be signed out like any other — [revokeSessionAction]
 * redirects it to /login.
 */
export function SessionsTable({ rows }: { rows: SessionRow[] }) {
  // One message for the whole table, not one per row — an in-row error shifts
  // the rows below it while a finger is over one.
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-ink-faint">
        No devices are signed in right now.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        {/* w-full to spread when there's room, nowrap so past that the box
            above scrolls. */}
        <table className="w-full text-[13px]">
          <thead>
            {/* The only rule in the table — columns from contents. */}
            <tr className="border-b border-line">
              <Column>Device</Column>
              <Column>Location</Column>
              <Column>Created</Column>
              <Column>Last active</Column>
              {/* On screen the column is just trash icons. */}
              <th scope="col" className="sr-only">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell className="text-ink">
                  {/* Flex so the glyph centres against the name, not its baseline. */}
                  <span className="flex items-center gap-2">
                    <DeviceMark kind={row.kind} />
                    {row.device ?? <Unknown label="Unknown device" />}
                    {row.current && (
                      <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                        This device
                      </span>
                    )}
                  </span>
                </Cell>

                {/* IP as the tooltip; promoted into the cell only when there's
                    no location — see [Address]. */}
                <Cell title={row.location ? (row.ip ?? undefined) : undefined}>
                  {row.location ?? <Address ip={row.ip} />}
                </Cell>

                {/* Relative dates, full timestamp in the tooltip — the app's habit. */}
                <Cell>
                  <RelativeDate date={row.createdAt} />
                </Cell>
                <Cell>
                  <RelativeDate date={row.lastSeenAt} />
                </Cell>

                <Cell className="text-right">
                  <SignOutButton row={row} onError={setError} />
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-[var(--space-item)] text-[13px] text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Signs one device out — on the current row, this one, and then it confirms
 * first. The row clears when the server re-renders the list ([refresh] in
 * [revokeSessionAction]), held on screen by the transition until it does.
 */
function SignOutButton({
  row,
  onError,
}: {
  row: SessionRow;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Position doubles as open/closed — null is closed. See [openConfirm].
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
    null,
  );
  const confirming = anchor !== null;

  /**
   * Opens the dialog, measured against the button. `fixed` (set in the JSX),
   * because the table's `overflow-x-auto` box clips vertically too and the
   * settings content scrolls — an absolute popover would be cut off by one and
   * scrolled under by the other. Right-anchored: the button is in the last
   * column of a table that may be scrolled sideways.
   */
  function openConfirm() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }

  useEffect(() => {
    if (!confirming) return;
    const close = () => setAnchor(null);

    // Press-outside or Escape. `pointerdown` not `click` so a press on another
    // row's trash closes this before that one opens.
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    // A fixed card doesn't follow the button — close it on any scroll or
    // resize rather than re-measure. Captured, to hear the content's own scroll.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [confirming]);

  function revoke() {
    onError(null);
    startTransition(async () => {
      try {
        // Optional: the current row's press redirects and resolves with
        // nothing — without the guard that flashes an error mid-navigation.
        const result: RevokeSessionResult | undefined =
          await revokeSessionAction(row.id);
        if (result && !result.ok) onError(result.error);
      } catch {
        onError("Couldn't sign that device out. It is still signed in.");
      }
    });
  }

  const name = row.device ?? "unknown device";
  const label = row.current ? "Log out of this device" : `Sign out ${name}`;

  return (
    // inline-block so the cell's text-align right-aligns it. The wrapper is
    // what a press lands "inside" — the dialog is its DOM child despite being
    // viewport-positioned, keeping the outside-press check a single `contains`.
    <span ref={rootRef} className="inline-block align-middle">
      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        onClick={
          row.current
            ? () => (confirming ? setAnchor(null) : openConfirm())
            : () => revoke()
        }
        // Named in full — five "Sign out" buttons read identically otherwise.
        aria-label={label}
        {...(row.current && {
          "aria-haspopup": "dialog" as const,
          "aria-expanded": confirming,
        })}
        title={pending ? "Signing out…" : label}
        // Danger only on hover and while confirming — a column of red at rest
        // reads as a warning about the table, not the press.
        className={`row-tint inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] hover:text-danger disabled:text-ink-faint disabled:hover:text-ink-faint ${
          confirming ? "text-danger" : "text-ink-muted"
        }`}
      >
        <TrashIcon aria-hidden className="h-4 w-4" />
      </button>

      {anchor && (
        <div
          role="dialog"
          aria-label="Log out of this device?"
          style={{ top: anchor.top, right: anchor.right }}
          // `fixed` — see [openConfirm]. w-max: one fixed short question, and
          // it sidesteps the nowrap inherited from [Cell].
          className="glass lift-2 fixed z-40 w-max rounded-[var(--radius-zone)] p-3 text-left"
        >
          <p className="text-[13px] text-ink">Log out of this device?</p>
          <div className="mt-2.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setAnchor(null)}
              className="row-tint rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] text-ink-muted hover:text-ink"
            >
              Stay
            </button>
            <button
              type="button"
              // Pre-selected, so Enter confirms straight away.
              autoFocus
              disabled={pending}
              onClick={revoke}
              className="row-tint rounded-[var(--radius-control)] px-2.5 py-1 text-[13px] text-danger hover:text-danger-hover"
            >
              {pending ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * The location column when no place name was recorded — which is every session
 * created against a local server, since the geolocation headers are Vercel's.
 * A loopback address is the machine you're on, so it says that in words —
 * keeping the address itself as the tooltip, the way a place name does. Any
 * other address prints as itself, in mono.
 */
function Address({ ip }: { ip: string | null }) {
  if (!ip) return <Unknown label="Unknown location" />;
  if (LOOPBACK.has(ip)) return <span title={ip}>Localhost</span>;
  return <span className="font-mono">{ip}</span>;
}

/**
 * Loopback, in the spellings a header actually arrives in: IPv6, IPv4, and the
 * IPv4-mapped IPv6 form a dual-stack listener reports.
 */
const LOOPBACK = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);

/**
 * The phone/computer glyph before a device's name. Faint 14px so it doesn't
 * compete with the name; `aria-hidden` since the name already says it. Nothing
 * drawn when the kind is unknown.
 */
function DeviceMark({ kind }: { kind: DeviceKind | null }) {
  if (!kind) return null;
  const Glyph = kind === "mobile" ? PhoneIcon : DesktopIcon;
  return <Glyph aria-hidden className="size-3.5 shrink-0 text-ink-faint" />;
}

/** A column heading: the caption style the deployment groups use. */
function Column({ children }: { children: ReactNode }) {
  return (
    <th
      scope="col"
      className="whitespace-nowrap pb-[var(--space-item)] pr-6 text-left text-[11px] font-normal uppercase tracking-wider text-ink-faint last:pr-0"
    >
      {children}
    </th>
  );
}

/** One cell. Nowrap is the layout — see the note on the table itself. */
function Cell({
  children,
  className = "text-ink-muted",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`whitespace-nowrap py-1.5 pr-6 align-middle last:pr-0 ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * A missing fact: a dash for the eye, the spelled-out label for screen readers.
 * Same construction as [DeploymentSection].
 */
function Unknown({ label }: { label: string }) {
  return (
    <span className="text-ink-faint">
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
