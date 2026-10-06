import { NoteEditor } from "@/components/editor/NoteEditor";
import { requireAuth } from "@/lib/auth/require-auth";
import { DAILY_TAG, dailyNoteTitle, parseDayKey, todayKey } from "@/lib/notes/daily";
import { getDailyNoteSlug, listNotesOverview } from "@/lib/notes/queries";
import { noteHref } from "@/lib/tags/routes";
import { buildTagTree, flattenTree } from "@/lib/tags/tree";
import { notFound, redirect } from "next/navigation";

export default async function DailyNotePage({
  params,
}: PageProps<"/daily-note/[date]">) {
    await requireAuth();
    const { date } = await params;
    const currentDate = parseDayKey(date)

    if (!currentDate) notFound();

    const slug = await getDailyNoteSlug(currentDate);
    
    if (slug) {
        redirect(noteHref(slug));
    } else {
        const listOverview = await listNotesOverview();
        const noteTitle = dailyNoteTitle(currentDate);
        
        return (
        <NoteEditor
        noteId={null}
        version={1}
        initialTitle={noteTitle}
        defaultTitle={noteTitle}
        initialBodyMd=""
        initialTags={[DAILY_TAG]}
        journalEntryDate={currentDate}
        pinned={false}
        updatedAt={new Date().toISOString()}
        backlinks={[]}
        allTags={flattenTree(
            buildTagTree(
            listOverview.map((n) => ({
                tags: n.tags,
                updatedAt: n.updatedAt.toISOString(),
            })),
            ),
        ).map((node) => node.name)}
        />
    );}
}
