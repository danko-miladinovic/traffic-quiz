import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "../../components/button";

export const metadata: Metadata = { title: "Duel sa prijateljem" };
export default function Duel() {
  return (
    <section className="container info-page">
      <p className="eyebrow">PRIJATELJSKI DUEL · U PRIPREMI</p>
      <h1>
        Dvoje igrača.
        <br />
        Jedan izazov.
      </h1>
      <p>Brz poziv, ista pitanja i prilika da zajedno naučite nešto novo.</p>
      <ol className="steps">
        <li>
          <strong>Pozovi prijatelja</strong>
          <span>Podeli privatni link ili pokaži QR kod.</span>
        </li>
        <li>
          <strong>Odgovorite na pet pitanja</strong>
          <span>Oboje dobijate ista pitanja. Tačnost je na prvom mestu.</span>
        </li>
        <li>
          <strong>Uporedite rezultate</strong>
          <span>Pogledajte objašnjenja i dogovorite revanš.</span>
        </li>
      </ol>
      <Button disabled>Kreiranje duela uskoro</Button>
      <p>
        <Link className="text-link" href="/">
          ← Nazad na početnu
        </Link>
      </p>
    </section>
  );
}
