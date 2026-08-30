"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  setProviderModelAction,
  type AiSettingsResult,
} from "@/lib/ai/actions";
import {
  PROVIDER_IDENTITIES,
  PROVIDER_IDS,
  PROVIDER_KINDS,
  type ProviderDetail,
  type ProviderId,
} from "@/lib/ai/types";
import { ModelPicker } from "./ModelPicker";

/** A server refusal, scoped to the provider its message is about. */
type Failure = { providerId: ProviderId; message: string };

/**
 * The AI providers, what each will run, and whether it can. Only the model is
 * editable (this app's own preference, in its database); everything else is
 * reported from env vars or a probe. After an edit the whole list is replaced
 * by the server's re-listed answer. A dark provider's block is usually just a
 * name and a pill; a hosted one adds an instruction line.
 */
export function ProviderList({ initial }: { initial: ProviderDetail[] }) {
  const [providers, setProviders] = useState(initial);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();

  /** Runs one action and takes its answer as the new state; clears first so a
   *  stale refusal can't linger. */
  function run(work: () => Promise<AiSettingsResult>, providerId: ProviderId) {
    setFailure(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (result.ok) {
          setProviders(result.providers);
        } else {
          setFailure({ providerId, message: result.error });
        }
      } catch {
        // Offline or session expired. Keep the list on screen — it's the last
        // known-good state.
        setFailure({
          providerId,
          message: "Couldn't reach the server. Nothing was changed.",
        });
      }
    });
  }

  // What an unpicked request runs on: first available in list order, matching
  // `resolveProvider`. Only marked when there's more than one to choose from.
  const ready = providers.filter((provider) => provider.available);
  const fallback = ready.length > 1 ? ready[0]?.id : undefined;

  // Hosted before local — the order [getProviderConfigs] and fallback use.
  const ordered = PROVIDER_KINDS.flatMap((kind) =>
    providers.filter((provider) => provider.kind === kind),
  );

  return (
    <div className="flex flex-col gap-4">
      {ordered.map((provider) => (
        <ProviderBlock
          key={provider.id}
          provider={provider}
          fallback={provider.id === fallback}
          busy={pending}
          failure={
            failure?.providerId === provider.id ? failure.message : undefined
          }
          onModel={(model) =>
            // Re-picking the current model just clears a rejection — nothing to write.
            model === provider.model
              ? setFailure(null)
              : run(
                  () =>
                    setProviderModelAction({
                      providerId: provider.id,
                      model,
                    }),
                  provider.id,
                )
          }
        />
      ))}
    </div>
  );
}

/**
 * One provider: name, pill, and — if configured — its model, shown as a picker
 * only when there's a catalogue of more than one to choose from, otherwise as
 * a plain value.
 */
function ProviderBlock({
  provider,
  fallback,
  busy,
  failure,
  onModel,
}: {
  provider: ProviderDetail;
  /** True for the one an unpicked request would run on. */
  fallback: boolean;
  busy: boolean;
  /** What the server refused about *this* provider, if anything. */
  failure?: string;
  onModel: (model: string) => void;
}) {
  // A single-entry list is always the model in force, so no picker is hidden.
  const choosable = provider.available && provider.models.length > 1;

  return (
    <div className="flex flex-col gap-[var(--space-item)]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {/* Muted when the provider can't answer, so state reads down the left edge. */}
        <p
          className={`min-w-0 truncate text-[15px] font-medium ${
            provider.available ? "text-ink" : "text-ink-muted"
          }`}
        >
          {provider.label}
        </p>

        <StatusPill provider={provider} />

        {fallback ? (
          // Not a pill — this is a tie-break, not a state.
          <span className="shrink-0 text-[11px] uppercase tracking-wider text-ink-faint">
            Default
          </span>
        ) : null}
      </div>

      {provider.model ? (
        <Row label="Model">
          {choosable ? (
            <ModelPicker
              label={`Model for ${provider.label}`}
              value={provider.model}
              models={provider.models}
              disabled={busy}
              onChange={onModel}
            />
          ) : (
            // One answer, so no chevron. Faint while the provider is dark.
            <span
              className={`truncate font-mono text-[13px] ${
                provider.available ? "text-ink" : "text-ink-faint"
              }`}
            >
              {provider.model}
            </span>
          )}
        </Row>
      ) : null}

      {/* An instruction naming a place outside this app — prose, and it wraps. */}
      {provider.kind === "hosted" &&
      !provider.available &&
      provider.unavailableReason ? (
        <p className="text-[13px] text-ink-faint">
          {provider.unavailableReason}
        </p>
      ) : null}

      {provider.modelsError ? (
        <p className="text-[13px] text-ink-faint">{provider.modelsError}</p>
      ) : null}

      {/* Under the control — it's a reply to the press that just happened. */}
      {failure ? (
        <p role="alert" className="text-[13px] text-danger">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Whether this provider can answer, in two words. Green for ready, accent for
 * "a key is set elsewhere" (an instruction follows), neutral for a local
 * server that just isn't running. Full reason in the tooltip.
 */
function StatusPill({ provider }: { provider: ProviderDetail }) {
  if (provider.available) {
    return <Pill className="bg-green-wash text-green">Ready</Pill>;
  }

  return (
    <Pill
      title={provider.unavailableReason}
      className={
        provider.kind === "hosted"
          ? "bg-accent-wash text-accent"
          : "bg-sunk text-ink-faint"
      }
    >
      {provider.unavailableStatus ?? "Unavailable"}
    </Pill>
  );
}

/** The shape all three share: 11px, fully rounded, sized to its two words. */
function Pill({
  className,
  title,
  children,
}: {
  className: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}

/** One fact in a provider's block: label left, value or control right. Same
 *  shape as [DeploymentSection]'s facts. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <span className="min-w-0 shrink-0 text-[13px] text-ink-muted">
        {label}
      </span>
      <span className="flex min-w-0 flex-1 justify-end">{children}</span>
    </div>
  );
}

/**
 * The section before the probes answer — one name line per provider (the part
 * known without asking), so the real block fills in rather than replaces it.
 */
export function ProviderListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      {PROVIDER_IDS.map((id) => (
        <div key={id} className="flex items-center gap-x-2.5">
          <p className="min-w-0 truncate text-[15px] font-medium text-ink-muted">
            {PROVIDER_IDENTITIES[id].label}
          </p>
          {/* The pill's shape, empty — no "Checking" claim. */}
          <span className="h-[21px] w-16 shrink-0 rounded-full bg-sunk" />
        </div>
      ))}
    </div>
  );
}
