import Link from "next/link";
import { categories, lessons, categoryPath } from "../../lib/education";
import { publicMetadata } from "../../lib/seo";
export const metadata = publicMetadata(
  "Učenje saobraćajnih pravila po oblastima",
  "Oblasti za učenje saobraćajnih pravila u Srbiji: znakovi, prvenstvo prolaza, raskrsnice i priprema za B kategoriju. Pročitaj proverene lekcije kada budu dostupne.",
  "/ucenje",
  lessons.length > 0,
);
export default function EducationPage() {
  return (
    <div className="container education-page">
      <header className="education-heading">
        <p className="eyebrow">SRBIJA · B KATEGORIJA · SRPSKA LATINICA</p>
        <h1>
          Razumi pravilo.
          <br />
          Poveži znanje.
        </h1>
        <p className="education-lead">
          Izaberi oblast. Pročitaj objašnjenje, razjasni nedoumicu i vrati se vežbanju svojim
          tempom.
        </p>
      </header>
      {!lessons.length && (
        <aside className="education-notice" aria-labelledby="review-title">
          <h2 id="review-title">Lekcije prolaze stručnu proveru.</h2>
          <p>
            Tekstovi će biti dostupni kada se završi provera izvora i objašnjenja za Srbiju. Do tada
            možeš da upoznaš oblasti i način rada aplikacije.
          </p>
        </aside>
      )}
      <section aria-labelledby="areas-title">
        <div className="section-heading">
          <h2 id="areas-title">Odaberi oblast</h2>
          <p>Korak po korak. Bez naloga i plaćanja.</p>
        </div>
        <div className="education-grid">
          {categories.map((category, index) => {
            const count = lessons.filter((lesson) => lesson.category === category.slug).length;
            return (
              <Link
                className="education-card"
                key={category.slug}
                href={categoryPath(category.slug)}
              >
                <span className="eyebrow">/0{index + 1}</span>
                <h3>{category.title}</h3>
                <p>{category.description}</p>
                <span className="education-card-status">
                  {count ? `Dostupne lekcije: ${count}` : "Lekcije na proveri"}{" "}
                  <span aria-hidden="true">↗</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="education-next" aria-labelledby="learning-title">
        <div>
          <h2 id="learning-title">Uči uz objašnjenje.</h2>
          <p>
            U vežbanju nema tajmera. Duel je zaseban izazov sa prijateljem, a rezultat nije zvanična
            procena spremnosti za ispit.
          </p>
        </div>
        <Link className="button" href="/vezbanje">
          Istraži vežbanje →
        </Link>
      </section>
    </div>
  );
}
