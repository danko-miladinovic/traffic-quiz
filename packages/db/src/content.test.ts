import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contentBankSchema } from "@duel/domain";
import { createDatabase } from "./client";
import { getPublishedQuestions, importContent } from "./content";

test("PostgreSQL import, publishing gates, projections and immutability", async () => {
  assert.ok(
    process.env.TEST_DATABASE_URL,
    "Set TEST_DATABASE_URL to a disposable migrated PostgreSQL database",
  );
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const db = createDatabase();
  const bank = contentBankSchema.parse(
    JSON.parse(
      readFileSync(new URL("../../../content/rs-b.sr-Latn.json", import.meta.url), "utf8"),
    ),
  );
  const suffix = randomUUID().slice(0, 8);
  for (const category of bank.categories) category.key += `-${suffix}`;
  for (const question of bank.questions) question.category += `-${suffix}`;
  const category = bank.categories[0].key;
  try {
    await importContent(db, bank);
    await importContent(db, bank);
    assert.equal(await db.questionRevision.count({ where: { category: { key: category } } }), 3);
    assert.deepEqual(await getPublishedQuestions(db, bank.locale, "B", category), []);
    for (const question of bank.questions) {
      question.review = {
        status: "REVIEWED",
        reviewer: "Automated fixture only",
        reviewedOn: "2026-11-10",
      };
    }
    await importContent(db, bank);
    assert.deepEqual(await getPublishedQuestions(db, bank.locale, "B", category), []);
    bank.questions[0].review.status = "PUBLISHED";
    await assert.rejects(importContent(db, bank), /--publish/);
    await importContent(db, bank, true);
    await importContent(db, bank, true);
    const publicRows = await getPublishedQuestions(db, bank.locale, "B", category);
    assert.equal(publicRows.length, 1);
    assert.equal("correctOption" in publicRows[0], false);
    assert.equal("explanation" in publicRows[0], false);
    assert.deepEqual(await getPublishedQuestions(db, "sr-Cyrl-RS", "B", category), []);
    const id = publicRows[0].id;
    await assert.rejects(
      db.questionRevision.update({ where: { id }, data: { prompt: "Tampered content" } }),
    );
    await assert.rejects(
      db.answerOption.updateMany({ where: { questionId: id }, data: { text: "Tampered option" } }),
    );
    bank.questions[0].prompt += " Changed";
    await assert.rejects(importContent(db, bank, true), /immutable/);
    bank.questions[0].revision = 2;
    await importContent(db, bank, true);
    assert.equal((await getPublishedQuestions(db, bank.locale, "B", category)).length, 1);
  } finally {
    await db.$disconnect();
  }
});
