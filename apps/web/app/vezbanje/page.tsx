import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "../../components/button";

export const metadata: Metadata = { title: "Vežbanje" };
export default function Practice() {
  return (
    <section className="container info-page">
      <p className="eyebrow">UČI SVOJIM TEMPOM</p>
      <h1>
        Znanje počinje
        <br />
        razumevanjem.
      </h1>
      <p>
        Vežbanje je sledeći korak u razvoju. Pripremamo pitanja za B kategoriju, sa objašnjenjem
        svakog odgovora.
      </p>
      <div className="notice">
        <h2>Pitanja su na proveri</h2>
        <p>
          Probni sadržaj još nije objavljen. Kada prođe stručnu proveru, ovde ćeš moći da izabereš
          oblast i započneš vežbanje bez naloga.
        </p>
        <Button disabled>Vežbanje uskoro</Button>
      </div>
      <Link className="text-link" href="/">
        ← Nazad na početnu
      </Link>
    </section>
  );
}
