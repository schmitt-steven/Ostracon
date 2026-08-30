import { Suspense } from "react";
import { listProviderDetails } from "@/lib/ai/providers";
import { ProviderList, ProviderListSkeleton } from "./ProviderList";
import { SectionNote } from "./SectionNote";

/**
 * AI — where the answers come from. A server component slot (like
 * [AccessSection]), so `server-only` [listProviderDetails] and its keys stay
 * out of the browser bundle. Suspended because listing costs up to three
 * network round trips, and AI sits above the free Access/Deployment sections.
 */
export function AiSection() {
  return (
    <div>
      {/* Above the Suspense boundary — true before anything is asked. */}
      <SectionNote>
        Gemini runs in the cloud. LM Studio and Ollama require a local server on this machine.
      </SectionNote>

      {/* Flush with the sentence above, no step in. */}
      <div className="mt-4">
        <Suspense fallback={<ProviderListSkeleton />}>
          <Providers />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The list, resolved for the first paint; from here it's [ProviderList]'s
 * state, replaced by the server's answer after each write. See lib/ai/actions.
 */
async function Providers() {
  const providers = await listProviderDetails();
  return <ProviderList initial={providers} />;
}
