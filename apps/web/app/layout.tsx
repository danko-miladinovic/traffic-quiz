import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { site, privateRobots } from "../lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(site.origin ?? "http://localhost:3000"),
  title: { default: "Saobraćajni Duel — Znanje na prvom mestu", template: "%s | Saobraćajni Duel" },
  description:
    "Besplatno vežbanje i prijateljski dueli za Srbiju. Lekcije objavljujemo nakon stručne provere.",
  robots: privateRobots,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sr-Latn-RS">
      <body>
        <a className="skip-link" href="#sadrzaj">
          Pređi na sadržaj
        </a>
        <header className="site-header">
          <div className="container header-inner">
            <Link className="brand" href="/" aria-label="Saobraćajni Duel — početna">
              <span className="brand-mark" aria-hidden="true">
                ↗
              </span>
              <span>
                saobraćajni
                <span className="brand-second">
                  duel<span className="brand-dot">.</span>
                </span>
              </span>
            </Link>
            <nav aria-label="Glavna navigacija">
              <Link href="/ucenje">Učenje</Link>
              <Link href="/vezbanje">Vežbanje</Link>
              <Link href="/duel">Duel 1 na 1</Link>
              <Link href="/o-projektu">
                O projektu <span aria-hidden="true">↗</span>
              </Link>
            </nav>
          </div>
        </header>
        <main id="sadrzaj" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer container">
          <span>Saobraćajni Duel © {new Date().getFullYear()}</span>
          <span>Srbija · B kategorija · Besplatno za sve</span>
          <Link href="/o-projektu">O projektu i privatnosti</Link>
        </footer>
      </body>
    </html>
  );
}
