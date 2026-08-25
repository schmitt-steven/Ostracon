import { DeploymentSection } from "@/components/settings/DeploymentSection";
import { SettingsView } from "@/components/settings/SettingsView";
import { requireAuth } from "@/lib/auth/require-auth";

/**
 * Everything about the instance rather than about a note.
 *
 * Its own route, for the reason /images and /tags are ones: the rail links to
 * it, and a view the rail can select ought to be a place. Behind the same
 * [requireAuth] as every other page — settings are the *last* thing to leave
 * open.
 *
 * [DeploymentSection] is handed over as an element rather than as the facts it
 * prints. It reads the database URL and the blob token to describe them, and a
 * server component passed into a client one as a slot is rendered here and
 * arrives there as finished output — so none of that code, and none of what it
 * touches, can be pulled into the browser bundle by the page that shows it.
 * The rest of the sections are the reader's own settings and belong to the
 * client; see [SettingsView] for how the page is put together.
 */
export default async function SettingsPage() {
  await requireAuth();
  return <SettingsView deployment={<DeploymentSection />} />;
}
