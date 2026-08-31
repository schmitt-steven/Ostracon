"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** The version upstream is at. */
  latest: string;
  /** The version running here. */
  current: string;
  /** That version's notes on GitHub. */
  releaseUrl: string;
  /** This copy's own repository, when the platform named it. */
  forkUrl: string | null;
  onClose: () => void;
};

/**
 * How to take an update — which is a thing done outside this app, on GitHub or
 * in a terminal, so all the dialog can do is say which steps and in what
 * order. Two paths because there are two ways to have installed Ostracon (see
 * the README): a fork, which GitHub can sync with a button, and a plain copy,
 * which has to pull from the upstream remote.
 *
 * Nothing here acts. Every control is a link out or a way to close, and no
 * button in this app can write to anyone's repository — deliberately, since
 * an update is a merge into code the reader may well have changed.
 */
export function UpdateDialog({
  latest,
  current,
  releaseUrl,
  forkUrl,
  onClose,
}: Props) {
  // On the document, as the tag dialogs — this opens from a rail row, and
  // focus is wherever that left it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Update to ${latest}`}
      className="scrim fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="glass lift-3 max-h-full w-full max-w-md overflow-y-auto rounded-[var(--radius-zone)] p-6">
        {/* The display face at dialog scale, as [NoteImport] and the settings
            headings — this is a heading, not the dialog's first sentence. */}
        <p className="font-display text-[20px] font-semibold leading-tight text-ink">
          Update to {latest}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          This copy is at {current}. Updating pulls the new code into your 
          repository. Vercel automatically builds it and applies any database changes. 
          Your notes, images and settings are not touched.
        </p>
        <a
          href={releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[13px] text-action underline-offset-2 hover:underline"
        >
          See release notes
        </a>

        <Path title="If you forked Ostracon">
          <p>
            Open{" "}
            {forkUrl ? (
              <a
                href={forkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-action underline-offset-2 hover:underline"
              >
                your repository
              </a>
            ) : (
              "your repository"
            )}{" "}
            on GitHub and press <b className="font-semibold text-ink">Sync
            fork</b>, then <b className="font-semibold text-ink">Update
            branch</b>. That&apos;s it, Vercel will then auto-deploy the update.
          </p>
        </Path>

        <Path title="If you cloned it into a repository of your own">
          <p>
            There is no fork to sync, so pull from Ostracon&apos;s repo instead.<br/>
            If you haven&apos;t added the remote yet, run:
          </p>
          <Command>
            git remote add upstream
            https://github.com/schmitt-steven/Ostracon.git
          </Command>
          <p className="mt-2">Then, for this update and every one after:</p>
          <Command>{"git pull upstream main\ngit push"}</Command>
        </Path>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="row-tint row-selected rounded-[var(--radius-control)] px-3 py-1.5 text-[13px] text-ink"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * One of the two ways to have installed Ostracon. Unmarked on purpose: any
 * ordinal reads as a sequence to work through, and only one of these applies
 * to any given reader. The headings say which is which.
 */
function Path({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      <div className="mt-1.5 text-[13px] text-ink-muted">{children}</div>
    </div>
  );
}

/** Something to be typed, laid out so it can be read and copied without wrapping. */
function Command({ children }: { children: React.ReactNode }) {
  return (
    <pre className="well mt-1.5 overflow-x-auto rounded-[var(--radius-control)] bg-sunk px-3 py-2 font-mono text-[12px] text-ink">
      {children}
    </pre>
  );
}
