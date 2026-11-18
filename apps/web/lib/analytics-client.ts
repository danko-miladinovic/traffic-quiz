"use client";
import type { z } from "zod";
import type { browserEventSchema } from "@duel/domain/analytics";
let consent = false;
export const setAnalyticsConsent = (value: boolean) => {
  consent = value;
};
export async function sendAnalytics(event: z.infer<typeof browserEventSchema>) {
  if (!consent) return;
  // Keep the same replay key for one bounded retry; never keep a persistent offline queue.
  for (let retry = 0; retry < 2 && consent; retry++) {
    try {
      const response = await fetch("/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        credentials: "same-origin",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok || response.status < 500) return;
    } catch {
      /* Analytics failures do not affect gameplay. */
    }
  }
}
export function trackInvitation(roomId: string, method: "copy" | "share") {
  if (consent)
    void sendAnalytics({ name: "invite_action", requestId: crypto.randomUUID(), roomId, method });
}
