"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { MAX_PINNED_TAGS, normalizeTagPreferences } from "./preferences-shape";
import { saveTagPreferences } from "./preferences-store";

/**
 * The write half of the client store in [preferences]: it commits a whole
 * snapshot locally and sends the same one here.
 *
 * Whole snapshots rather than a call per toggle because the three lists move
 * together — unpinning a tag drops its key from the order in the same breath —
 * and because the client has already decided what the answer is. The validation
 * still runs on this side: the action is reachable by anyone who can POST to it.
 */

// Loose but finite, so a malformed payload can't store an unbounded row. The
// cap that means something is applied below by clamping rather than by
// rejecting: the one caller that can overrun it is the one-time lift of a
// device's localStorage (see [liftLegacyTagPreferences]), and dropping that
// reader's sixth pinned tag beats dropping all five of the others with it.
const TagPreferencesInput = z.object({
  pinned: z.array(z.string().max(120)).max(500),
  hues: z.record(z.string().max(120), z.number()),
  order: z.array(z.string().max(200)).max(500),
});

export async function saveTagPreferencesAction(input: unknown): Promise<void> {
  await requireAuth();
  const sent = TagPreferencesInput.parse(input);

  // Normalized for content — the hue snapping and the root-keying are the same
  // rules a stored row is read back under.
  const preferences = normalizeTagPreferences({
    ...sent,
    // Only what the sidebar can draw; the rest was never reachable.
    pinned: sent.pinned.slice(0, MAX_PINNED_TAGS),
    // Room for both sections several times over. Not a cap on anything real —
    // the working size is MAX_PINNED_TAGS + MAX_PINNED_NOTES and the client
    // drops a key as it unpins — just a bound on how large the row can get.
    order: sent.order.slice(0, 100),
  });

  await saveTagPreferences(preferences);
  // No revalidate and no refresh on purpose: the sidebar is already showing
  // this snapshot from the store that sent it, and re-rendering the layout
  // would only redraw the same rows.
}
