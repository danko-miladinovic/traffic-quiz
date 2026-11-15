import type { Metadata } from "next";
import { Duel } from "../../components/duel";

export const metadata: Metadata = {
  title: "Duel sa prijateljem",
  description: "Pozovi prijatelja linkom ili QR kodom na besplatan duel od pet pitanja.",
  referrer: "no-referrer",
};
export default function DuelPage() {
  return <Duel />;
}
