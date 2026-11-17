import type { Metadata } from "next";
import { Practice } from "../../components/practice";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Vežbanje",
  description:
    "Vežbaj saobraćajna pravila po oblastima, bez naloga. Proveri odgovor i pročitaj objašnjenje.",
};
export default function PracticePage() {
  return <Practice />;
}
