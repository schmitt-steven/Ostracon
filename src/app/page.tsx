import Link from "next/link";
import { ImageBrowser } from "@/components/images/ImageBrowser";
import { ImagesToggle } from "@/components/notes/ImagesToggle";
import { NoteCount } from "@/components/notes/NoteCount";
import { NoteList } from "@/components/notes/NoteList";
import { requireAuth } from "@/lib/auth/require-auth";
import { listStoredImages } from "@/lib/images/queries";
import { listNotesOverview } from "@/lib/notes/queries";

type OverviewView = "notes" | "images";

async function loadNotes() {
  const notes = await listNotesOverview();
  return notes.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
}

// The gallery needs the notes too — it filters images by the note each came
// from — but the list view still never pays for the blob round trip. The two
// gallery fetches are independent, so they overlap.
async function loadView(view: OverviewView) {
  if (view === "images") {
    const [images, notes] = await Promise.all([listStoredImages(), loadNotes()]);
    return { view, images, notes } as const;
  }
  return { view, notes: await loadNotes() } as const;
}

export default async function HomePage(props: PageProps<"/">) {
  await requireAuth();
  // Anything other than the one known value falls back to the notes list
  // rather than erroring — this is a hand-editable query string.
  const view: OverviewView =
    (await props.searchParams).view === "images" ? "images" : "notes";
  const data = await loadView(view);

  const switcher = <ImagesToggle active={data.view === "images"} />;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-8 py-12">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl font-semibold tracking-tight text-ink">
          {/* The note count is a client component so it can tick down with the
              row it's counting, as one motion — the gallery's is static. */}
          {data.view === "images" ? (
            `${data.images.length} ${data.images.length === 1 ? "Image" : "Images"}`
          ) : (
            <NoteCount noteIds={data.notes.map((note) => note.id)} />
          )}
        </h1>
        <Link
          href="/notes/new"
          className="shrink-0 rounded-full bg-blue px-5 py-2.5 text-base font-medium text-paper shadow-sm shadow-blue/25 transition-colors hover:bg-blue-hover"
        >
          New note
        </Link>
      </div>
      {/* Both browsers carry the switcher in their own control row. The
          first-run empty state has no such row, so it carries it directly. */}
      {data.view === "images" ? (
        <ImageBrowser
          images={data.images}
          notes={data.notes}
          viewSwitcher={switcher}
        />
      ) : data.notes.length > 0 ? (
        <NoteList initialNotes={data.notes} viewSwitcher={switcher} />
      ) : (
        <>
          {/* Same flex row the control bar uses — as a plain block the
              switcher would stretch its pill across the full width. */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            {switcher}
          </div>
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
        </>
      )}
    </div>
  );
}
