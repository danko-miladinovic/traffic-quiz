import Link from "next/link";
import { notFound } from "next/navigation";
import { categories, lessons, categoryPath, lessonPath } from "../../../../lib/education";
import { publicMetadata } from "../../../../lib/seo";
export const dynamicParams = false;
export function generateStaticParams() {
  return categories.map((category) => ({ slug: category.slug }));
}
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  return publicMetadata(
    category.title + " — lekcije za B kategoriju",
    category.description,
    categoryPath(slug),
    lessons.some((lesson) => lesson.category === slug),
  );
}
export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  const available = lessons.filter((lesson) => lesson.category === slug);
  return (
    <div className="container education-page">
      <nav className="breadcrumbs" aria-label="Putanja stranice">
        <Link href="/ucenje">← Sve oblasti</Link>
      </nav>
      <header className="education-heading">
        <p className="eyebrow">SRBIJA · B KATEGORIJA</p>
        <h1>{category.title}</h1>
        <p className="education-lead">{category.description}</p>
      </header>
      <section aria-labelledby="lessons-title">
        <h2 id="lessons-title">Lekcije u ovoj oblasti</h2>
        {available.length ? (
          <div className="education-grid">
            {available.map((lesson) => (
              <Link className="education-card" key={lesson.slug} href={lessonPath(lesson.slug)}>
                <h3>{lesson.title}</h3>
                <p>{lesson.description}</p>
                <span className="text-link">Pročitaj lekciju →</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="education-notice">
            <h3>Objašnjenja su na proveri.</h3>
            <p>
              U ovoj oblasti još nema objavljenih lekcija. Tekst postaje dostupan tek nakon stručne
              provere sadržaja i izvora. Neobjavljeni nacrti nisu materijal za pripremu ispita.
            </p>
          </div>
        )}
      </section>
      <section className="education-next" aria-labelledby="practice-title">
        <div>
          <h2 id="practice-title">Nastavi svojim tempom.</h2>
          <p>
            U vežbanju izaberi oblast sa dostupnim pitanjima. Svaki prihvaćeni odgovor prati
            objašnjenje.
          </p>
        </div>
        <Link
          className="button"
          href={
            category.practiceCategory
              ? `/vezbanje#oblast-${category.practiceCategory}`
              : "/vezbanje"
          }
        >
          Izaberi vežbanje →
        </Link>
      </section>
      <Link className="text-link" href="/ucenje">
        Pogledaj ostale oblasti →
      </Link>
    </div>
  );
}
