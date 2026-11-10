import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertRevisionTransition, contentBankSchema, questionSchema } from "./index";
import { databaseEnv, realtimeEnv } from "./env";

const bank = contentBankSchema.parse(
  JSON.parse(readFileSync(new URL("../../../content/rs-b.sr-Latn.json", import.meta.url), "utf8")),
);
const question = bank.questions[0];

test("seed content validates and stays out of publication", () => {
  assert.ok(bank.questions.length >= 5);
  assert.ok(bank.questions.every((item) => item.review.status === "DRAFT"));
});

test("rejects unknown categories, duplicate options, and invalid answer keys", () => {
  assert.equal(contentBankSchema.safeParse({ ...bank, categories: [] }).success, false);
  assert.equal(questionSchema.safeParse({ ...question, correctOption: "missing" }).success, false);
  assert.equal(
    questionSchema.safeParse({ ...question, options: [question.options[0], question.options[0]] })
      .success,
    false,
  );
});

test("publishing requires review evidence and published revisions cannot change", () => {
  assert.equal(
    questionSchema.safeParse({ ...question, review: { status: "PUBLISHED" } }).success,
    false,
  );
  const published = questionSchema.parse({
    ...question,
    review: { status: "PUBLISHED", reviewer: "Test reviewer", reviewedOn: "2026-11-10" },
  });
  assert.doesNotThrow(() => assertRevisionTransition(published, structuredClone(published)));
  assert.throws(
    () => assertRevisionTransition(published, { ...published, explanation: "Changed explanation" }),
    /immutable/,
  );
  assert.throws(() => assertRevisionTransition(published, question), /immutable/);
});

test("environment validation rejects non-Postgres URLs and malformed origins", () => {
  assert.equal(databaseEnv.safeParse({ DATABASE_URL: "https://example.com" }).success, false);
  assert.equal(realtimeEnv.safeParse({ WEB_ORIGIN: "http://localhost:3000/path" }).success, false);
  assert.equal(
    realtimeEnv.safeParse({ WEB_ORIGIN: "http://localhost:3000", REALTIME_PORT: "70000" }).success,
    false,
  );
});
