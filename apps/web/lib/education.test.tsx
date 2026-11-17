import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { educationBankSchema, type EducationBank } from "@duel/domain/education";
import { LessonArticle } from "../components/lesson-article";
import { education, getLesson } from "./education";
import { jsonLd, lessonStructuredData, publicSitemap, robotsPolicy, seoSettings } from "./seo";

// Synthetic review identities exist only in test memory, never application content.
function fixture(): EducationBank {
  const bank = structuredClone(education);
  bank.lessons[0].review = {
    status: "PUBLISHED",
    reviewer: "Synthetic automated fixture",
    reviewedOn: bank.lessons[0].updatedOn,
  };
  bank.lessons[1].review = {
    status: "REVIEWED",
    reviewer: "Synthetic automated fixture",
    reviewedOn: bank.lessons[1].updatedOn,
  };
  return educationBankSchema.parse(bank);
}
const enabled = { enabled: true, origin: "https://saobracajni-duel.rs" };

test("SEO configuration requires explicit public origin and rejects unsafe settings", () => {
  assert.deepEqual(seoSettings({}), { enabled: false, origin: undefined });
  for (const env of [
    { SEARCH_INDEXING_ENABLED: "yes" },
    { SEARCH_INDEXING_ENABLED: "true" },
    { SITE_URL: "https://example.org/path" },
    { SITE_URL: "https://user:secret@example.org" },
    { SEARCH_INDEXING_ENABLED: "true", SITE_URL: "http://localhost:3000" },
    { SEARCH_INDEXING_ENABLED: "true", SITE_URL: "https://127.0.0.1" },
  ])
    assert.throws(() => seoSettings(env));
  assert.deepEqual(
    seoSettings({ SEARCH_INDEXING_ENABLED: "true", SITE_URL: enabled.origin }),
    enabled,
  );
});
test("sitemap and robots exclude drafts, empty categories, gameplay and all staging pages", () => {
  const bank = fixture();
  assert.deepEqual(publicSitemap(bank, { ...enabled, enabled: false }), []);
  assert.deepEqual(publicSitemap(education, enabled), []);
  const sitemap = publicSitemap(bank, enabled);
  assert.equal(sitemap.length, 4);
  assert.ok(sitemap.every((item) => !/duel#|\/duel$|vezbanje|api|poziv|request/.test(item.url)));
  assert.ok(!sitemap.some((item) => item.url.includes(bank.lessons[1].slug)));
  assert.equal(sitemap[3].lastModified, bank.lessons[0].updatedOn);
  assert.deepEqual(robotsPolicy(false, enabled), { rules: { userAgent: "*", disallow: "/" } });
  assert.equal(robotsPolicy(true, enabled).sitemap, enabled.origin + "/sitemap.xml");
  assert.equal(getLesson(education.lessons[0].slug), undefined);
});
test("lesson HTML contains full content, sources, review, anchor navigation and escaped structured data", () => {
  const lesson = fixture().lessons[0];
  const html = renderToStaticMarkup(
    <LessonArticle
      lesson={lesson}
      categoryTitle="Synthetic category"
      related={[]}
      origin={enabled.origin}
      practiceCategory="signalizacija"
    />,
  );
  for (const section of lesson.sections) {
    assert.ok(html.includes(section.paragraphs[0]));
    assert.ok(html.includes(`href="#${section.id}"`));
    assert.ok(html.includes(`id="${section.id}"`));
  }
  assert.ok(html.includes(lesson.sources[0].url));
  assert.ok(html.includes(lesson.review.reviewer!));
  assert.ok(html.includes('href="/vezbanje#oblast-signalizacija"'));
  const data = lessonStructuredData(lesson, "Synthetic category", enabled.origin);
  assert.equal(data["@graph"][0]["@type"], "Article");
  assert.equal(data["@graph"][1]["@type"], "BreadcrumbList");
  assert.ok(!jsonLd({ title: "</script><script>alert(1)</script>" }).includes("<"));
});
