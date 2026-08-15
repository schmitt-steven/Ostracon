import Link from "next/link";
import { getBacklinks } from "@/lib/notes/queries";

export async function BacklinksPanel({ noteId }: { noteId: string }) {
  const backlinks = await getBacklinks(noteId);
  if (backlinks.length === 0) return null;

  return (
    <div className="mt-12">
      <h2 className="mb-4 flex items-center gap-3 text-sm font-medium uppercase tracking-[0.18em] text-accent">
        Linked from
        <span aria-hidden className="h-px flex-1 bg-line" />
      </h2>
      <ul className="flex flex-wrap gap-2.5">
        {backlinks.map((b) => (
          <li key={b.slug}>
            <Link
              href={`/notes/${b.slug}`}
              className="inline-block rounded-full border border-line bg-surface px-4 py-2 text-base text-ink-muted transition-colors hover:border-blue/50 hover:bg-blue-wash hover:text-blue"
            >
              {b.title || "Untitled"}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
