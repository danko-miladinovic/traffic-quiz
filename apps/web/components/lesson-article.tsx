import Link from "next/link";
import { AdSlot } from "./ad-slot";
import { adsDisabled, type AdConfiguration } from "../lib/ad-policy";
import type { Lesson } from "@duel/domain/education";
import { jsonLd, lessonStructuredData } from "../lib/seo";

export function LessonArticle({
  lesson,
  categoryTitle,
  related,
  origin,
  practiceCategory,
  ads = adsDisabled,
}: {
  lesson: Lesson;
  categoryTitle: string;
  related: Lesson[];
  origin?: string;
  practiceCategory?: string;
  ads?: AdConfiguration;
}) {
  return (
    <div className="container education-page">
      <nav className="breadcrumbs" aria-label="Putanja stranice">
        <Link href="/ucenje">Učenje</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/ucenje/oblasti/${lesson.category}`}>{categoryTitle}</Link>
      </nav>
      <article className="lesson-article">
        <header className="education-heading">
          <p className="eyebrow">SRBIJA · B KATEGORIJA · {categoryTitle}</p>
          <h1>{lesson.title}</h1>
          <p className="education-lead">{lesson.summary}</p>
          <p className="lesson-review">
            Stručna provera: {lesson.review.reviewer} ·{" "}
            <time dateTime={lesson.review.reviewedOn}>{lesson.review.reviewedOn}</time> · Izmena:{" "}
            <time dateTime={lesson.updatedOn}>{lesson.updatedOn}</time>
          </p>
        </header>
        <div className="lesson-layout">
          <nav className="lesson-contents" aria-label="Sadržaj lekcije">
            <h2>U ovoj lekciji</h2>
            <ol>
              {lesson.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="lesson-body">
            {lesson.sections.map((section) => (
              <section key={section.id} id={section.id} tabIndex={-1}>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                {section.checklist && (
                  <ul>
                    {section.checklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            <section aria-labelledby="sources-title">
              <h2 id="sources-title">Izvori i provera</h2>
              <p>
                Oblast: Srbija, B kategorija, srpska latinica. Lekcija je pomoć pri učenju i ne
                zamenjuje obuku.
              </p>
              <ul>
                {lesson.sources.map((source) => (
                  <li key={source.url + source.reference}>
                    <a href={source.url} rel="external noreferrer">
                      {source.title}
                    </a>
                    <p>
                      {source.reference} · Pristupljeno:{" "}
                      <time dateTime={source.accessedOn}>{source.accessedOn}</time>
                    </p>
                  </li>
                ))}
              </ul>
              <p className="lesson-review">
                {lesson.rights.attribution} · {lesson.rights.license} · Revizija {lesson.revision}
              </p>
            </section>
          </div>
        </div>
      </article>
      <AdSlot
        placement="lesson-after-content"
        context={{ surface: "lesson" }}
        configuration={ads}
      />
      <section className="education-next" aria-labelledby="next-title">
        <div>
          <p className="eyebrow">OD ČITANJA DO RAZUMEVANJA</p>
          <h2 id="next-title">Proveri šta si razumeo.</h2>
          <p>
            Izaberi oblast i pročitaj objašnjenje posle odgovora. Dostupnost pitanja zavisi od
            završene provere.
          </p>
        </div>
        <Link
          className="button"
          href={practiceCategory ? `/vezbanje#oblast-${practiceCategory}` : "/vezbanje"}
        >
          Pređi na vežbanje →
        </Link>
      </section>
      {related.length > 0 && (
        <section aria-labelledby="related-title">
          <h2 id="related-title">Povezane lekcije</h2>
          <div className="education-grid">
            {related.map((item) => (
              <Link
                className="education-card"
                key={item.slug}
                href={`/ucenje/lekcije/${item.slug}`}
              >
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span className="text-link">Pročitaj lekciju →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(lessonStructuredData(lesson, categoryTitle, origin)),
          }}
        />
      )}
    </div>
  );
}
