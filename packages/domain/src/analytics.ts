import { z } from "zod";

export const analyticsSources = ["direct", "organic", "social", "referral", "unknown"] as const;
export const analyticsSource = z.enum(analyticsSources);
export const analyticsNames = [
  "page_view",
  "practice_started",
  "question_answered",
  "practice_completed",
  "duel_created",
  "invite_action",
  "player_joined",
  "duel_started",
  "duel_completed",
  "rematch_requested",
  "challenge_shared",
] as const;
export type AnalyticsName = (typeof analyticsNames)[number];
export type AnalyticsSource = z.infer<typeof analyticsSource>;
export const preferenceSchema = z.object({ consent: z.boolean() }).strict();
export const browserEventSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("page_view"),
      requestId: z.uuid(),
      page: z
        .string()
        .max(160)
        .regex(/^\/[a-z0-9/-]*$/),
      source: analyticsSource,
    })
    .strict(),
  z
    .object({
      name: z.literal("invite_action"),
      requestId: z.uuid(),
      roomId: z.uuid(),
      method: z.enum(["copy", "share"]),
    })
    .strict(),
]);
// All free text stays in this browser-local function. Only a fixed enum crosses the network.
export function trafficSource(
  referrer: string,
  origin: string,
  campaign?: string | null,
): AnalyticsSource {
  const knownSearch =
    /(^|\.)(google\.(?:com|rs|co\.uk|de|fr|at|hr|ba|me|it)|bing\.com|duckduckgo\.com|yahoo\.com)$/;
  const knownSocial =
    /(^|\.)(facebook\.com|instagram\.com|t\.co|x\.com|twitter\.com|linkedin\.com|reddit\.com|youtube\.com)$/;
  const source = campaign?.toLowerCase();
  if (
    source &&
    ["facebook", "instagram", "twitter", "linkedin", "reddit", "youtube"].includes(source)
  )
    return "social";
  // A campaign naming a search engine cannot establish unpaid/organic traffic.
  if (source) return "unknown";
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (!["http:", "https:"].includes(url.protocol)) return "unknown";
    if (url.origin === origin) return "direct";
    if (knownSearch.test(url.hostname)) return "organic";
    if (knownSocial.test(url.hostname)) return "social";
    return "referral";
  } catch {
    return "unknown";
  }
}
export function analyticsFlag(value: string | undefined) {
  if (value !== undefined && value !== "true" && value !== "false")
    throw new Error("ANALYTICS_ENABLED must be true or false");
  return value === "true";
}
