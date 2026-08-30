import { AccessSection } from "@/components/settings/AccessSection";
import { AiSection } from "@/components/settings/AiSection";
import { DataSection } from "@/components/settings/DataSection";
import { DeploymentSection } from "@/components/settings/DeploymentSection";
import { SettingsView } from "@/components/settings/SettingsView";
import { requireAuth } from "@/lib/auth/require-auth";

/**
 * Everything about the instance rather than a note. Its own route (the rail
 * links to it). The four data sections are passed as server-component slots,
 * so their `server-only` code and secrets (keys, the password row, the DB URL)
 * stay out of the client bundle. See [SettingsView].
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
