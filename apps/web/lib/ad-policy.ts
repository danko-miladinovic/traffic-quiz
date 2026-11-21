import type { DuelPhase } from "@duel/domain/duel";

export const adPlacements = {
  "home-after-topics": { surface: "home", format: "banner" },
  "lesson-after-content": { surface: "lesson", format: "rectangle" },
  "category-after-lessons": { surface: "category", format: "banner" },
  "practice-after-results": { surface: "practice", format: "banner" },
  "duel-after-results": { surface: "duel", format: "banner" },
} as const;
export type AdPlacement = keyof typeof adPlacements;
export type AdContext =
  | { surface: "home" | "lesson" | "category" }
  | { surface: "practice"; phase: "selection" | "question" | "feedback" | "results" }
  | { surface: "duel"; phase: DuelPhase | "selection" };
export type AdConfiguration = { provider: "none" | "placeholder" };
export const adsDisabled: AdConfiguration = { provider: "none" };

export function adConfiguration(env: Record<string, string | undefined>): AdConfiguration {
  if (env.ADS_PREVIEW !== undefined && !["true", "false"].includes(env.ADS_PREVIEW))
    throw new Error("ADS_PREVIEW must be true or false");
  return env.NODE_ENV === "development" && env.ADS_PREVIEW === "true"
    ? { provider: "placeholder" }
    : adsDisabled;
}
export function adPlacementAllowed(placement: AdPlacement, context: AdContext) {
  const definition = adPlacements[placement];
  if (!definition || definition.surface !== context.surface) return false;
  if (context.surface === "duel") return context.phase === "FINISHED";
  if (context.surface === "practice") return context.phase === "results";
  return true;
}
