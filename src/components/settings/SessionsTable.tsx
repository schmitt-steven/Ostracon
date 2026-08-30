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
 * One signed-in device, flattened for printing.
 *
 * Plain strings rather than the [SessionRecord] the query returns, and dates as
 * ISO rather than as `Date`. Both are the price of the boundary: this file runs
 * in the browser, so everything it receives is serialised, and a row shape that
 * mirrors the table would ship column names and a hash's worth of adjacent
 * facts across it for no reason. See [SessionsSetting] for where it is built.
 */
export type SessionRow = {
  id: string;
  /** `Safari on iPhone`, the owner's own name for it, or null when neither. */
  device: string | null;
  /** Which glyph stands beside that name — see [deviceKind]. Null draws none. */
  kind: DeviceKind | null;
  /** `Frankfurt, Germany`, or null off the platform — see lib/auth/geo. */
  location: string | null;
  /** Where it was last seen from. The location's evidence, and its fallback. */
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  /** The one you are reading this on. It is named, and signing it out logs
   * this browser out. */
  current: boolean;
};

/**
 * The devices holding a valid cookie, and the way to take one away.
 *
 * **A real table, which is unusual for this app.** Everything else in settings
 * is a row of label-and-value, because everything else is one fact with one
 * name. This is four facts about each of several things, and the only question
 * it exists to answer — "is that one mine?" — is answered by reading *across* a
 * row and then *down* a column: an unfamiliar city next to a phone you don't
 * own is the signal, and neither half means anything alone. Columns are what
 * make that comparison possible, so columns is what it gets.
 *
 * It scrolls sideways rather than reflowing. Four columns don't fold into a
 * phone-width pane without becoming four stacked label-and-value rows per
 * device — which is the layout that lost the comparison above. Nothing wraps
 * and nothing is ellipsised: a half-printed city or a truncated `Chrome on…`
 * is worse than a scroll, because the reader cannot tell it is missing.
 *
 * **The current device is named in its own row, and can be signed out like any
 * other.** Naming it is the whole point of the table: the question being asked
 * is "which of these isn't me", which cannot be answered until one of them is
 * known to be. The label sits next to the device rather than in the last
 * column, because it is a fact about the device and the last column is where
 * the actions are. Its trash asks first, and then logs this browser out and
 * lands on /login — see [revokeSessionAction], which does the redirect rather
 * than leaving the reader on a page they can no longer load.
 */
export function SessionsTable({ rows }: { rows: SessionRow[] }) {
  // One message for the table rather than one per row: a failure here is
  // almost always the same failure for every row (the action didn't reach the
  // server), and an error that appears *inside* a row moves the rows below it
  // while a finger is still over one of them.
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
        {/* w-full so the columns spread across the pane when there is room,
            and nowrap throughout so they stop shrinking when there isn't —
            past that point the box above scrolls. */}
        <table className="w-full text-[13px]">
          <thead>
            {/* The one rule in the table. It separates the names of the
                columns from their contents, which is the only division here
                that isn't already obvious; lines between the rows would be
                drawing four boxes around four devices the eye has already
                separated by their spacing. */}
            <tr className="border-b border-line">
              <Column>Device</Column>
              <Column>Location</Column>
              <Column>Created</Column>
              <Column>Last active</Column>
              {/* Named for anything not looking at the page. On screen the
                  column is a stack of trash icons, and a heading over it
                  would be a word none of them prints. */}
              <th scope="col" className="sr-only">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell className="text-ink">
                  {/* A flex row rather than inline content, so the glyph sits
                      centred against the name instead of on its baseline —
                      an inline SVG hangs its box off the text baseline and
                      would sink half a stroke below the line it introduces. */}
                  <span className="flex items-center gap-2">
                    <DeviceMark kind={row.kind} />
                    {row.device ?? <Unknown label="Unknown device" />}
                    {/* The column-heading caption, reused as a tag. It is the
                        one size in this table that is already spoken as "a
                        label rather than a value", which is what this is — and
                        being smaller and fainter than the device name, it reads
                        as an annotation on that name instead of competing with
                        the two identical `Chrome on macOS` above and below it. */}
                    {row.current && (
                      <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                        This device
                      </span>
                    )}
                  </span>
                </Cell>

                {/* The address is the tooltip rather than a line of its own.
                    It is what the city was worked out *from* — worth having
                    when a location looks wrong, not worth a column of its own
                    when it looks right. Where there is no location at all it
                    is promoted into the cell, because then it is the only
                    locating fact there is. */}
                <Cell title={row.location ? (row.ip ?? undefined) : undefined}>
                  {row.location ??
                    (row.ip ? (
                      <span className="font-mono">{row.ip}</span>
                    ) : (
                      <Unknown label="Unknown location" />
                    ))}
                </Cell>

                {/* Both dates relative, both carrying the full timestamp as
                    their tooltip — the app's habit everywhere, and the only
                    thing that fits two date columns into a pane this wide.
                    "3 days ago" is also the form the question is asked in. */}
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
 * Signs one device out — including, on the current row, this one.
 *
 * The row does not disappear on the press. What removes it is the server
 * re-rendering the list — [revokeSessionAction] calls `refresh()` — so the
 * table always shows what the database says rather than what the browser hopes
 * it says. The transition it runs in is what keeps the old row on screen,
 * un-jumping, until the new list arrives.
 *
 * **A trash icon rather than the words "Sign out".** The column is one control
 * repeated down a table whose other four columns all want the room, and a
 * five-across table that has to scroll sideways is paying for that room in the
 * only currency it has. The icon is the app's own trash — the same 24-unit box
 * and stroke the note and index rows use — so the gesture is one the reader has
 * already made elsewhere in the app, and the words it stands for are still
 * there for the pointer as a tooltip and for the screen reader as the label.
 *
 * **The current device's button says what it will do, and asks first.** It is
 * the one press in this column that does something to the reader rather than to
 * a machine somewhere else: the other rows are undone by picking up the other
 * device, this one ends with a login screen and a password to remember. So it
 * takes the confirmation step the note and index trashes already take, in the
 * same popover, with the consequence spelled out in it — the press that logs
 * you out should not be the press that a mis-aimed click makes. The other rows
 * stay one press, because they are cheap to be wrong about.
 *
 * It is otherwise the same button and the same icon; the difference belongs in
 * the words and in the step, not in a control that looks unlike its neighbours.
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

  // Where the dialog is, rather than whether it is open — the two are the same
  // fact, and keeping them in one piece of state means there is no frame in
  // which it is open at nowhere. See [openConfirm] for why it carries
  // coordinates at all.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
    null,
  );
  const confirming = anchor !== null;

  /**
   * Opens the dialog, measured against the button.
   *
   * **It is positioned rather than nested, because there is nowhere to nest
   * it.** This button sits inside the table's `overflow-x-auto` box, which
   * clips vertically as well — `overflow-x: auto` computes `overflow-y` to
   * `auto`, not `visible` — and that box sits inside the settings pane's own
   * scroller. An absolutely-positioned popover under the last column would be
   * cut off by the first of those and scrolled under by the second. `fixed`
   * escapes both; nothing on the path from here to the root establishes a
   * containing block that would reel it back in.
   *
   * Right-anchored, since the button is in the last column of a table that may
   * already be scrolled sideways: measuring from the left would put a 224px
   * card off the right-hand edge.
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

    // The dismissals the app's other confirmations keep: a press anywhere else,
    // or Escape. `pointerdown` rather than `click` so a press that lands on
    // another row's trash closes this before that one opens.
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    // A fixed card is measured once and then stays where the viewport put it,
    // so anything that moves the button underneath it has to close it — the
    // settings pane scrolling, the table scrolling sideways, the window
    // resizing. Closing rather than re-measuring: a confirmation that drifts
    // along under a scrolling page is asking to be pressed by accident, which
    // is the thing this dialog exists to prevent. Captured, so the pane's own
    // scroll is heard from here.
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
        // Typed as optional against the action's own return type, because the
        // current row's press doesn't return: [revokeSessionAction] redirects
        // to /login, and a redirect resolves here with nothing to read. Without
        // the guard that would land in the catch below and flash an error over
        // a page that is already navigating away.
        const result: RevokeSessionResult | undefined =
          await revokeSessionAction(row.id);
        if (result && !result.ok) onError(result.error);
      } catch {
        onError("Couldn't sign that device out. It is still signed in.");
      }
    });
  }

  const name = row.device ?? "unknown device";
  // "Sign out this device" would be true of every row in the table; the reason
  // this one is worth its own sentence is the consequence, so the consequence
  // is what it says.
  const label = row.current ? "Log out of this device" : `Sign out ${name}`;

  return (
    // inline-block, and the button inline-flex inside it: the cell right-aligns
    // its contents with `text-align`, which a block-level control spanning the
    // column would ignore. The wrapper is here to be the thing a press can land
    // "inside" — the dialog is a child of it in the DOM even though it is
    // positioned against the viewport, which is what lets the outside-press
    // check above stay a single `contains`.
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
        // Named in full for anything reading the page a row at a time, where
        // five buttons all called "Sign out" are five identical buttons.
        aria-label={label}
        {...(row.current && {
          "aria-haspopup": "dialog" as const,
          "aria-expanded": confirming,
        })}
        // What the icon would have said. The pending state goes here too rather
        // than into the button, which has no room for a word: the icon dims and
        // stops answering, and the tooltip says why.
        title={pending ? "Signing out…" : label}
        // Danger only under the pointer — and while this one is asking, since
        // an open dialog about logging out should be attached to something
        // that looks like it means it. At rest they are several identical
        // controls in a column, and a column of red is a warning about the
        // table rather than about the press: the same restraint the note and
        // tag delete buttons keep.
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
          // See [openConfirm] for why this is `fixed` and where the numbers
          // come from. z above the rows for the same reason the note's is.
          //
          // Sized to its contents rather than to the 56 the note and index
          // confirmations use. Those hold a note's title and have to allow for
          // a long one; this holds one fixed short question, and a fixed width
          // would be mostly air. It also settles the inherited nowrap — this is
          // a child of a [Cell] — by giving the line exactly the room it asks
          // for instead of a width to overflow.
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
 * The glyph in front of a device's name — a phone or a computer.
 *
 * **It is not a fifth fact, it is the first one read.** The question this table
 * exists to answer is "is that one of mine", and the fastest disqualifier is
 * shape: a phone in the list when you have never signed in from one is visible
 * before a single word has been read, and long before an unfamiliar city has
 * been noticed three columns across. So it goes at the left edge, where the eye
 * enters the row.
 *
 * Faint and 14px, because it must not compete with the name it introduces — it
 * is drawn from the same 16-box rail set the sidebar uses, at the size that set
 * was drawn for. Silent to a screen reader: the words beside it already say
 * `Safari on iPhone`, and reading the picture out first would be reading the
 * same fact twice.
 *
 * Nothing is drawn where the kind is unknown, and the name still starts at the
 * same place — see [gap] on the cell's flex row, which reserves nothing.
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
 * A fact the request didn't carry — no user agent, no geography, no address.
 *
 * The dash is for the eye; what it stands for is spelled out for anything that
 * isn't looking at the page, since "em dash" read aloud in a row of answers is
 * worse than silence. The same construction [DeploymentSection] uses.
 */
function Unknown({ label }: { label: string }) {
  return (
    <span className="text-ink-faint">
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
