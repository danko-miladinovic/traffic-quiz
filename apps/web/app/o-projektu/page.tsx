import type { Metadata } from "next";

export const metadata: Metadata = { title: "O projektu i privatnosti" };
export default function About() {
  return (
    <article className="container info-page prose">
      <p className="eyebrow">SAOBRAĆAJNI DUEL</p>
      <h1>
        Dobro znanje.
        <br />
        Za svakoga.
      </h1>
      <p>
        Gradimo besplatnu obrazovnu platformu za učenje saobraćajnih pravila u Srbiji. Počinjemo od
        B kategorije, na srpskom jeziku i latinici.
      </p>
      <h2>Gde smo sada?</h2>
      <p>
        Prva verzija je u izradi. Vežbanje i dueli još nisu dostupni. Pitanja su originalni
        obrazovni primeri, a ne zvanična ispitna baza. Objavljivaćemo ih tek nakon stručne provere.
      </p>
      <h2>Besplatno, bez naloga</h2>
      <p>
        Za učenje i igru neće biti potrebni registracija, pretplata ni plaćanje. U budućnosti
        platformu mogu podržati jasno označeni oglasi, uz prioritet kvalitetu učenja.
      </p>
      <h2>Privatnost u ovoj verziji</h2>
      <p>
        Aplikacija trenutno ne uključuje analitiku, oglase, korisničke naloge ni kolačiće za
        praćenje. Server i pružalac hostinga mogu obrađivati tehničke podatke o zahtevima. Pre
        javnog pokretanja biće objavljene informacije o rukovaocu, rokovima čuvanja i kontaktu za
        privatnost.
      </p>
    </article>
  );
}
