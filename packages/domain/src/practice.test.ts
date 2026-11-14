import assert from "node:assert/strict";
import test from "node:test";
import { practiceAnswerSchema, practiceStartSchema, scorePractice } from "./practice";

test("practice scoring uses accepted answers and validates the denominator", () => {
  assert.deepEqual(scorePractice([{ correct: true }, { correct: false }, { correct: true }], 3), {
    correct: 2,
    percent: 67,
  });
  assert.deepEqual(scorePractice([{ correct: false }], 1), { correct: 0, percent: 0 });
  assert.throws(() => scorePractice([], 0));
  assert.throws(() => scorePractice([{ correct: true }, { correct: true }], 1));
});
test("practice inputs reject forged scores and malformed replay identifiers", () => {
  assert.equal(
    practiceStartSchema.safeParse({ categoryKey: "bezbednost", requestId: "anything" }).success,
    false,
  );
  assert.equal(
    practiceAnswerSchema.safeParse({ questionId: "question", optionKey: "option", score: 100 })
      .success,
    false,
  );
  assert.equal(
    practiceAnswerSchema.safeParse({ questionId: "question", optionKey: "option" }).success,
    true,
  );
});
