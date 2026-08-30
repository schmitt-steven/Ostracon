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

/**
 * Something the server refused, and which provider it was about.
 *
 * Scoped, because the message is usually an instruction about one provider —
 * "no longer available to new users, use models/gemini-3.6-flash" — and an
 * instruction printed under the section heading, three rows above the control
 * it concerns, makes the reader work out who it is talking to. Every failure
 * this page can have belongs to a row, because every control on it does.
 */
type Failure = { providerId: ProviderId; message: string };

/**
 * AI's one row: the providers, what each will run, and whether it can.
 *
 * **Settings sets the terms; the editor makes the choice.** Which provider
 * answers a particular question is decided in the AI menu, in the same breath
 * as the question, and lasts only as long as the tab — see [provider-choice].
 * That is the right scope for "ask this one about this paragraph" and the wrong
 * scope for everything else, because a model and a key are not per-question
 * decisions. They belong to the instance, they should survive closing the tab,
 * and there was nowhere to put them: the model came from an environment
 * variable, which cannot be changed from inside the app at all. That gap is
 * what this section closes.
 *
 * **One thing here is editable and the rest is reported.** The model is
 * editable because it is this app's own preference: it lives in this app's
 * database and a change takes effect on the very next request. Everything else
 * — whether a key arrived, whether a local server answered — is an environment
 * variable or a fact about another process, and no amount of UI can make a
 * running process read a value it wasn't started with.
 *
 * **The state is the server's answer, not a local copy of it.** The one control
 * here calls an action that writes and then re-lists, and the list that comes
 * back replaces this component's state wholesale. So a model chosen for LM
 * Studio is echoed back as whatever LM Studio actually has loaded rather than
 * as what was clicked.
 *
 * **A provider is a name, a pill and — at most — a model.** Everything that was
 * a row of its own is now either inside the pill or gone: the two group
 * headings, the hosted/local word at the end of every name line, the key row
 * naming an environment variable, the status line, the Reload button. What is
 * left is what a reader comes here to find out, which is who can answer and
 * what they will answer with. The rest was scaffolding that had grown around
 * three providers and stood taller than they did — the section spent most of
 * its height captioning itself.
 *
 * Where a provider *can't* answer the pill says so in two words and the block
 * ends there, unless there is something the reader has to go and do. That is
 * the hosted case and only the hosted case: a key is set somewhere else, in a
 * dashboard or a file, and the sentence naming which is worth a line. A local
 * server that isn't running needs no instruction — it is on the same desk.
 */
export function ProviderList({ initial }: { initial: ProviderDetail[] }) {
  const [providers, setProviders] = useState(initial);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Runs one action and takes its answer as the new truth.
   *
   * Clearing first is what makes a stale refusal impossible: whatever the last
   * attempt said stops being on screen the moment another one starts.
   */
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
        // Offline, or the session expired and the action was redirected to the
        // login page. The list on screen stays: it is the last thing known to
        // be true, and emptying the section over one failed round trip is
        // worse than being a minute stale and saying so.
        setFailure({
          providerId,
          message: "Couldn't reach the server. Nothing was changed.",
        });
      }
    });
  }

  // What an unpicked request runs on: the first available provider in list
  // order, which is exactly what `resolveProvider` walks to. Worked out here
  // rather than sent from the server so it can't disagree with the rows it is
  // marking — both come from the same array.
  const ready = providers.filter((provider) => provider.available);
  // Only worth saying when there is a choice to be ambiguous about. With one
  // provider answering, "Default" is a label on the only door in the room.
  const fallback = ready.length > 1 ? ready[0]?.id : undefined;

  // Hosted before local, which is the order [getProviderConfigs] builds them
  // in and the order fallback walks them in.
  const ordered = PROVIDER_KINDS.flatMap((kind) =>
    providers.filter((provider) => provider.kind === kind),
  );

  return (
    // 16px between providers, against the 8px inside one — the page's own
    // scale, and the step every other section puts between two of its rows.
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
            // Picking the model already in force is how a reader follows the
            // advice in a rejection ("use gemini-3.6-flash" when that is what
            // the trigger already shows). There is nothing to write, so nothing
            // is written — but the rejection it answers has been acted on and
            // goes.
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
 * One provider: its name, its state, and what it will run.
 *
 * The name line is the whole of the summary — the name, and a pill saying
 * whether it can answer. Everything under it is conditional, and a provider
 * that can't answer usually has nothing under it at all, which is the point:
 * two dark providers should cost the section four lines, not fourteen.
 *
 * **The model is shown whether or not the provider can run**, as a control
 * where there is a catalogue to choose from and as a plain value where there
 * isn't. A dark provider still has a model configured, and what it *would* run
 * is the one useful thing left to say about it — printing nothing there reads
 * as the setting having been lost.
 *
 * **One model is not a choice.** LM Studio holds one model in memory at a time
 * on most machines, so its picker was a chevron over a menu of exactly the row
 * already showing — a control that cannot change anything, which is worse than
 * no control because it invites the press that proves it. Ollama lands here
 * whenever one model is pulled, and Gemini does when the catalogue can't be
 * reached and only the model in force is left. In all three the honest drawing
 * is the value itself.
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
  // Two, not one: a menu you can only pick the current answer out of is a
  // dropdown in shape only. And a single-entry list *is* always the model in
  // force — the local probe resolves `model` out of the list it found, and the
  // hosted one runs its catalogue through `withCurrent` — so dropping the
  // control here can never hide a model that could have been chosen.
  const choosable = provider.available && provider.models.length > 1;

  return (
    <div className="flex flex-col gap-[var(--space-item)]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {/* 15px, the size every setting's name is set at across this page, and
            medium because this one heads a block rather than labelling one
            row. Muted when the provider can't answer: the pill says it first,
            and a name that has gone quiet with it means the state can be read
            straight down the left edge without stopping at the words. */}
        <p
          className={`min-w-0 truncate text-[15px] font-medium ${
            provider.available ? "text-ink" : "text-ink-muted"
          }`}
        >
          {provider.label}
        </p>

        <StatusPill provider={provider} />

        {fallback ? (
          // Not a second pill. Two chips on one line read as two states, and
          // this is not a state — it is a tie-break between providers that are
          // all in the same one.
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
            // No chevron: there is only one answer, either because the
            // provider hasn't given a list or because the list it gave has one
            // model on it. A trigger that opens onto a foregone conclusion is
            // worse than a value that admits it is only a value.
            //
            // Faint only while the provider is dark, where the model is a
            // setting rather than a fact. On a ready one it is what the next
            // question will actually run on, and reads at full strength.
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

      {/* Prose, and it wraps: what goes here is an instruction naming a place
          outside this app, and a half-printed instruction is worse than none
          because the reader cannot see that it was cut. */}
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

      {/* Last in the block, under the control rather than over it: it is a
          reply to the press that just happened, and it usually names the model
          to pick instead — so it wants to be read on the way back up to the
          picker. */}
      {failure ? (
        <p role="alert" className="text-[13px] text-danger">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Whether this provider can answer, in two words.
 *
 * **It replaced a coloured dot, and the words are the reason.** A dot says
 * *something* is the case and sends the reader looking for the sentence saying
 * what; the pill is the sentence, at the size a two-word one deserves. Green
 * for ready is the one place this app paints green — see the note on `--green`
 * — and it earns it by being the fact the whole block hangs off.
 *
 * **Three tones, and the split is about what the reader does next.** Green is
 * fine. Accent is *you have to go somewhere else* — a key lives in a dashboard
 * or a dotfile, so the pill is warm and an instruction follows it. Neutral is a
 * fact about right now that needs no instruction: a local server isn't running,
 * and the reader either starts it or doesn't. Marking that amber would be the
 * section asking for attention it has no use for, twice over on every machine
 * where LM Studio and Ollama are simply not installed.
 *
 * The long form of the reason stays as the tooltip, so nothing the old status
 * line carried is lost — it is folded into the two words that stand for it.
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

/**
 * One fact inside a provider's block: its name on the left, its value or its
 * control against the right edge.
 *
 * The same shape [DeploymentSection] uses for a row of facts, and deliberately
 * so — this *is* a fact, and on the one provider where it can be changed it
 * says so by being drawn as a control rather than by sitting in a layout of
 * its own.
 */
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
 * The section before the probes have answered — see [AiSection] for why there
 * is a wait at all.
 *
 * One name line per provider, which is the part that is known without asking:
 * the labels are configuration, and only the pill and the model under them
 * depend on the answer. So the block that arrives is this one with its facts
 * filled in rather than a different shape, and Access below it settles once
 * instead of twice.
 */
export function ProviderListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      {PROVIDER_IDS.map((id) => (
        <div key={id} className="flex items-center gap-x-2.5">
          <p className="min-w-0 truncate text-[15px] font-medium text-ink-muted">
            {PROVIDER_IDENTITIES[id].label}
          </p>
          {/* The pill's shape with nothing in it. A word here — "Checking" —
              would be a claim about what the probe is doing, and a probe that
              has already timed out is doing nothing. */}
          <span className="h-[21px] w-16 shrink-0 rounded-full bg-sunk" />
        </div>
      ))}
    </div>
  );
}
