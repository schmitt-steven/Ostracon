import Link from "next/link";
import { NoteList } from "@/components/notes/NoteList";
import { requireAuth } from "@/lib/auth/require-auth";
import { listNotesOverview } from "@/lib/notes/queries";

export default async function HomePage() {
  await requireAuth();
  const notes = await listNotesOverview();
  const initialNotes = notes.map((n) => ({
    ...n,
    updatedAt: n.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-8 py-12">
      <div className="mb-9 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-semibold tracking-tight text-ink">
            {notes.length} {notes.length === 1 ? "Note" : "Notes"}
          </h1>
        </div>
        <Link
          href="/notes/new"
          className="shrink-0 rounded-full bg-blue px-5 py-2.5 text-base font-medium text-paper shadow-sm shadow-blue/25 transition-colors hover:bg-blue-hover"
        >
          New note
        </Link>
      </div>
      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-8 py-16 text-center">
          <p className="font-display text-xl text-ink">Nothing here yet</p>
          <p className="mt-2 text-base text-ink-muted">
            Start with your first note — link others with{" "}
            <code className="rounded bg-paper-sunk px-1.5 py-0.5 font-mono text-sm text-accent">
              [[wikilinks]]
            </code>
            .
          </p>
        </div>
      ) : (
        <NoteList initialNotes={initialNotes} />
      )}
    </div>
  );
}
