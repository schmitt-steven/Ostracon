import { Suspense } from "react";
import { listProviderDetails } from "@/lib/ai/providers";
import { ProviderList, ProviderListSkeleton } from "./ProviderList";
import { SectionNote } from "./SectionNote";

/**
 * AI — where the answers come from.
 *
 * A server component handed to [SettingsView] as a slot, for the same reason
 * [AccessSection] and [DeploymentSection] are: [listProviderDetails] is
 * `server-only` and reads keys and base URLs, and the surest way for neither to
 * reach a browser bundle is for the code that touches them never to be in one.
 * What crosses is [describeProvider]'s output plus a list of model names — no
 * secret has a field to travel in.
 *
 * **Suspended, because listing costs network round trips.** Three of them,
 * potentially: the local pair are asked what they have loaded, and Gemini is
 * asked for its catalogue so there is something to pick a model *from*. That
 * last one is why settings uses [listProviderDetails] and the editor's menu
 * does not — the menu opens on a keystroke mid-sentence and only needs to know
 * who can answer.
 *
 * AI sits above Access and Deployment, so without a boundary here a stalled
 * local server or a slow reply from Google would keep the password row and the
 * release facts off the page behind it.
 */
export function AiSection() {
  return (
    <div>
      {/* One sentence for the section, in place of the two group headings and
          the hosted/local word that used to hang off every name line. It is
          the same information — where each of these actually runs — said once,
          in prose, where it costs a line instead of five. It also says the
          thing the headings never could: *why* the local two are usually dark
          on a phone.

          Above the Suspense boundary, because it is the one part of this
          section that is true before anything has been asked. It paints with
          the heading. */}
      <SectionNote>
        Gemini runs in the cloud. LM Studio and Ollama require a local server on this machine.
      </SectionNote>

      {/* Flush with the sentence above it and with every other section on the
          page — no step in. The sentence is 13px and faint and the provider
          names are 15px and medium, which is enough to keep the first of them
          from reading as its next paragraph; an indent on top of that would
          make AI the one section whose contents start somewhere else. */}
      <div className="mt-4">
        <Suspense fallback={<ProviderListSkeleton />}>
          <Providers />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The list, resolved once for the first paint. From here on it is the browser's
 * — [ProviderList] holds it as state, and every control on it replaces that
 * state with what the server said after the write. See lib/ai/actions.
 */
async function Providers() {
  const providers = await listProviderDetails();
  return <ProviderList initial={providers} />;
}
