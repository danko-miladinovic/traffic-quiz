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
        Vežbanje po oblastima je spremno za objavljena pitanja, a dueli su u pripremi. Pitanja su
        originalni obrazovni primeri, a ne zvanična ispitna baza. Dostupna su za vežbanje tek nakon
        stručne provere i objavljivanja.
      </p>
      <h2>Besplatno, bez naloga</h2>
      <p>
        Za učenje i igru neće biti potrebni registracija, pretplata ni plaćanje. U budućnosti
        platformu mogu podržati jasno označeni oglasi, uz prioritet kvalitetu učenja.
      </p>
      <h2>Privatnost u ovoj verziji</h2>
      <p>
        Aplikacija ne uključuje analitiku, oglase ni korisničke naloge. Kada započneš vežbanje,
        koristimo privatni kolačić sesije da sačuvamo tvoje odgovore i omogućimo nastavak u istom
        pregledaču. Ne tražimo ime ni imejl. Sesija ističe posle 30 dana neaktivnosti, a pokušaji se
        brišu nakon 30 dana kroz periodično čišćenje. Aktivno vežbanje može da se nastavi u roku od
        24 sata. Kolačić nije namenjen praćenju niti oglašavanju.
      </p>
      <p>
        Server i pružalac hostinga mogu obrađivati tehničke podatke o zahtevima. Pre javnog
        pokretanja biće objavljene informacije o rukovaocu, rokovima čuvanja i kontaktu za
        privatnost.
      </p>
    </article>
  );
}
