import type { ReactNode } from "react";
import {
  adPlacements,
  adPlacementAllowed,
  adsDisabled,
  type AdConfiguration,
  type AdContext,
  type AdPlacement,
} from "../lib/ad-policy";

// Providers receive placement metadata only, never gameplay state or visitor identifiers.
export interface AdProvider {
  id: "placeholder";
  render: (placement: AdPlacement) => ReactNode;
}
const placeholder: AdProvider = {
  id: "placeholder",
  render: () => (
    <div className="ad-slot-content">
      <strong>Mesto za oglas</strong>
      <p>Oglasi nisu aktivni.</p>
    </div>
  ),
};
const providers = { placeholder };

export function AdSlot({
  placement,
  context,
  configuration = adsDisabled,
  contained = false,
}: {
  placement: AdPlacement;
  context: AdContext;
  configuration?: AdConfiguration;
  contained?: boolean;
}) {
  // A second production guard also protects slots mounted by client gameplay components.
  if (
    process.env.NODE_ENV === "production" ||
    configuration.provider !== "placeholder" ||
    !adPlacementAllowed(placement, context)
  )
    return null;
  const definition = adPlacements[placement];
  const provider = providers[configuration.provider];
  return (
    <aside
      className={`ad-slot ad-slot--${definition.format}${contained ? " container" : ""}`}
      aria-label="Oglas — razvojni pregled"
      data-ad-placement={placement}
      data-ad-provider={provider.id}
    >
      <p className="ad-slot-label">Oglas · razvojni pregled</p>
      {provider.render(placement)}
    </aside>
  );
}
