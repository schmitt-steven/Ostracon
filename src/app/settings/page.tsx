import { AccessSection } from "@/components/settings/AccessSection";
import { AiSection } from "@/components/settings/AiSection";
import { DataSection } from "@/components/settings/DataSection";
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
 * [AiSection], [AccessSection], [DataSection] and [DeploymentSection] are
 * handed over as elements rather than as the facts they print. One reads the AI
 * providers' keys and base URLs, one the stored password's row, one every note
 * in the collection, the last the database URL and the blob token — and a
 * server component passed into a client one as a slot is rendered here and
 * arrives there as finished output, so none of that code, and none of what it
 * touches, can be pulled into the browser bundle by the page that shows it. The
 * rest of the sections are the reader's own settings and belong to the client;
 * see [SettingsView] for how the page is put together.
 */
export default async function SettingsPage() {
  await requireAuth();
  return (
    <SettingsView
      ai={<AiSection />}
      access={<AccessSection />}
      data={<DataSection />}
      deployment={<DeploymentSection />}
    />
  );
}
