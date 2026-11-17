import type { Metadata } from "next";
import { Duel } from "../../components/duel";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Duel sa prijateljem",
  description: "Pozovi prijatelja linkom ili QR kodom na besplatan duel od pet pitanja.",
  referrer: "no-referrer",
};
export default function DuelPage() {
  return <Duel />;
}
