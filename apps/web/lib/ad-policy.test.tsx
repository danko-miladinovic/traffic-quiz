import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdSlot } from "../components/ad-slot";
import { LessonArticle } from "../components/lesson-article";
import { education } from "./education";
import { adConfiguration, adPlacements, type AdContext, type AdPlacement } from "./ad-policy";

const preview = { provider: "placeholder" as const };
test("advertising preview is explicit, development-only and cannot enable a real provider", () => {
  for (const env of [
    {},
    { NODE_ENV: "development" },
    { NODE_ENV: "production", ADS_PREVIEW: "true" },
    { NODE_ENV: "test", ADS_PREVIEW: "true" },
  ])
    assert.equal(adConfiguration(env).provider, "none");
  assert.deepEqual(adConfiguration({ NODE_ENV: "development", ADS_PREVIEW: "true" }), preview);
  assert.throws(() => adConfiguration({ NODE_ENV: "development", ADS_PREVIEW: "adsense" }));
  assert.equal(
    renderToStaticMarkup(<AdSlot placement="home-after-topics" context={{ surface: "home" }} />),
    "",
  );
  const environment: Record<string, string | undefined> = process.env;
  const previous = environment.NODE_ENV;
  try {
    environment.NODE_ENV = "production";
    assert.equal(
      renderToStaticMarkup(
        <AdSlot
          placement="home-after-topics"
          context={{ surface: "home" }}
          configuration={preview}
        />,
      ),
      "",
    );
  } finally {
    if (previous === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = previous;
  }
});
test("slots reject wrong surfaces and every active, lobby, feedback and interrupted gameplay state", () => {
  const contexts: AdContext[] = [
    { surface: "duel", phase: "selection" },
    ...(["WAITING", "READY", "ROUND", "ROUND_RESULT", "ABORTED", "EXPIRED"] as const).map(
      (phase) => ({ surface: "duel" as const, phase }),
    ),
    ...(["selection", "question", "feedback"] as const).map((phase) => ({
      surface: "practice" as const,
      phase,
    })),
  ];
  for (const context of contexts)
    for (const placement of Object.keys(adPlacements) as AdPlacement[])
      assert.equal(
        renderToStaticMarkup(
          <AdSlot placement={placement} context={context} configuration={preview} />,
        ),
        "",
      );
  assert.equal(
    renderToStaticMarkup(
      <AdSlot
        placement="duel-after-results"
        context={{ surface: "home" }}
        configuration={preview}
      />,
    ),
    "",
  );
});
test("allowed placements render labeled static noninteractive placeholders without executable or remote content", () => {
  const contexts: Record<AdPlacement, AdContext> = {
    "home-after-topics": { surface: "home" },
    "category-after-lessons": { surface: "category" },
    "lesson-after-content": { surface: "lesson" },
    "practice-after-results": { surface: "practice", phase: "results" },
    "duel-after-results": { surface: "duel", phase: "FINISHED" },
  };
  for (const [placement, context] of Object.entries(contexts)) {
    const html = renderToStaticMarkup(
      <AdSlot placement={placement as AdPlacement} context={context} configuration={preview} />,
    );
    assert.ok(html.includes('aria-label="Oglas — razvojni pregled"'));
    assert.ok(html.includes(`data-ad-placement="${placement}"`));
    assert.ok(html.includes("Oglasi nisu aktivni."));
    assert.doesNotMatch(html, /<(script|iframe|img|a|button)\b|\bon\w+=|https?:/i);
  }
});
test("article placement follows the full source/review content, without publishing the fixture", () => {
  const lesson = structuredClone(education.lessons[0]);
  lesson.review = {
    status: "PUBLISHED",
    reviewer: "Synthetic test fixture only",
    reviewedOn: lesson.updatedOn,
  };
  const html = renderToStaticMarkup(
    <LessonArticle lesson={lesson} categoryTitle="Synthetic category" related={[]} ads={preview} />,
  );
  assert.ok(html.includes(lesson.sections[0].paragraphs[0]));
  assert.ok(html.indexOf('data-ad-placement="lesson-after-content"') > html.indexOf("</article>"));
  assert.ok(
    html.indexOf('data-ad-placement="lesson-after-content"') < html.indexOf('id="next-title"'),
  );
});
