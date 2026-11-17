import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { educationBankSchema, lessonSchema, publishedLessons } from "./education";
const bank = educationBankSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../content/lessons/rs-b.sr-Latn.json", import.meta.url), "utf8"),
  ),
);

test("educational drafts stay unpublished with explicit jurisdiction and original rights", () => {
  assert.equal(bank.lessons.length, 5);
  assert.equal(publishedLessons(bank).length, 0);
  assert.equal(educationBankSchema.safeParse({ ...bank, jurisdiction: "HR" }).success, false);
  assert.equal(
    lessonSchema.safeParse({ ...bank.lessons[0], review: { status: "PUBLISHED" } }).success,
    false,
  );
  assert.equal(
    lessonSchema.safeParse({ ...bank.lessons[0], review: { status: "REVIEWED" } }).success,
    false,
  );
});
test("rejects broken editorial references and stale review evidence", () => {
  const lesson = bank.lessons[0];
  for (const change of [
    { category: "unknown" },
    { related: ["unknown"] },
    { related: [lesson.slug] },
    { sections: [lesson.sections[0], lesson.sections[0]] },
    {
      review: {
        status: "PUBLISHED",
        reviewer: "Synthetic reviewer for validation only",
        reviewedOn: "2026-01-01",
      },
    },
    { sources: [{ ...lesson.sources[0], url: "javascript:alert(1)" }] },
  ])
    assert.equal(
      educationBankSchema.safeParse({ ...bank, lessons: [{ ...lesson, ...change }] }).success,
      false,
    );
  assert.equal(
    educationBankSchema.safeParse({ ...bank, lessons: [lesson, lesson] }).success,
    false,
  );
});
test("public selection distinguishes reviewed from explicitly published lessons", () => {
  const fixture = structuredClone(bank);
  fixture.lessons[0].review = {
    status: "REVIEWED",
    reviewer: "Synthetic validation fixture",
    reviewedOn: fixture.lessons[0].updatedOn,
  };
  assert.equal(publishedLessons(educationBankSchema.parse(fixture)).length, 0);
  fixture.lessons[0].review.status = "PUBLISHED";
  assert.deepEqual(
    publishedLessons(educationBankSchema.parse(fixture)).map((item) => item.slug),
    [fixture.lessons[0].slug],
  );
});
