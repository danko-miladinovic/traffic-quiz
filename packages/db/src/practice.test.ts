import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { contentBankSchema } from "@duel/domain";
import { PracticeError, type PracticeEvent } from "@duel/domain/practice";
import { createDatabase } from "./client";
import { importContent } from "./content";
import { demoCategory, demoQuestions } from "./demo";
import {
  answerPractice,
  cleanupPractice,
  getPractice,
  listPracticeCategories,
  openGuestSession,
  startPractice,
} from "./practice";

const rejects = (code: string) => (error: unknown) =>
  error instanceof PracticeError && error.code === code;
const token = () => randomBytes(32).toString("hex");

test("practice persistence, privacy, races, scoring, revision freezing and retention", async (t) => {
  assert.ok(
    process.env.TEST_DATABASE_URL,
    "TEST_DATABASE_URL must point to disposable migrated PostgreSQL",
  );
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const db = createDatabase();
  const now = new Date();
  const hash = token();
  const other = token();
  const key = `practice-${randomUUID().slice(0, 8)}`;
  const bank = contentBankSchema.parse({
    jurisdiction: "RS",
    locale: "sr-Latn-RS",
    language: "sr",
    script: "Latn",
    licenceCategory: "B",
    categories: [
      {
        key,
        title: "Synthetic test category",
        description: "Isolated automated test fixtures, never educational content.",
      },
    ],
    questions: demoQuestions.map((question, index) => ({
      key: `fixture-${index}`,
      revision: 1,
      category: key,
      prompt: question.prompt,
      explanation: question.explanation,
      options: question.options,
      correctOption: question.correctOption,
      sources: [
        {
          title: "Synthetic automated fixture",
          url: "https://example.invalid/fixture",
          reference: "Test only",
          accessedOn: "2026-11-13",
        },
      ],
      rights: {
        license: "PROJECT-ORIGINAL",
        attribution: "Synthetic integration test",
        original: true,
      },
      review: { status: "DRAFT" },
    })),
  });
  const events: PracticeEvent[] = [];
  const onEvent = (event: PracticeEvent) => events.push(event);
  try {
    await openGuestSession(db, hash, now);
    await openGuestSession(db, other, now);
    await importContent(db, bank);
    await t.test("drafts and reviewed-only content cannot start a real practice", async () => {
      assert.equal(
        (await listPracticeCategories(db)).find((category) => category.key === key)?.count,
        0,
      );
      await assert.rejects(
        startPractice(db, hash, { categoryKey: key, requestId: randomUUID() }),
        rejects("NO_CONTENT"),
      );
      for (const question of bank.questions)
        question.review = {
          status: "REVIEWED",
          reviewer: "Automated fixture only, not educational review",
          reviewedOn: "2026-11-13",
        };
      await importContent(db, bank);
      await assert.rejects(
        startPractice(db, hash, { categoryKey: key, requestId: randomUUID() }),
        rejects("NO_CONTENT"),
      );
      for (const question of bank.questions) question.review.status = "PUBLISHED";
      await importContent(db, bank, true);
      assert.equal(
        (await listPracticeCategories(db)).find((category) => category.key === key)?.count,
        5,
      );
    });
    const input = { categoryKey: key, requestId: randomUUID() };
    const starts = await Promise.all([
      startPractice(db, hash, input, { onEvent }),
      startPractice(db, hash, input, { onEvent }),
    ]);
    let state = starts[0];
    await t.test("starts are idempotent, private and contain no unrevealed answers", async () => {
      assert.equal(starts[0].id, starts[1].id);
      assert.equal(state.total, 5);
      assert.equal(state.feedback, null);
      assert.equal(state.result, null);
      assert.equal("correctOption" in state.current!, false);
      assert.equal("explanation" in state.current!, false);
      await assert.rejects(getPractice(db, other, state.id), rejects("NOT_FOUND"));
      await assert.rejects(getPractice(db, token(), state.id), rejects("SESSION_EXPIRED"));
      await assert.rejects(
        startPractice(db, hash, { ...input, categoryKey: "another-category" }),
        rejects("REQUEST_CONFLICT"),
      );
    });
    await t.test("new published revisions do not alter an existing attempt", async () => {
      const frozen = structuredClone(state.current);
      for (const question of bank.questions) {
        question.revision = 2;
        question.prompt += " New revision.";
        question.correctOption = "opcija-2";
      }
      await importContent(db, bank, true);
      state = await getPractice(db, hash, state.id);
      assert.deepEqual(state.current, frozen);
      assert.equal(
        (await listPracticeCategories(db)).find((category) => category.key === key)?.count,
        5,
      );
      const snapshot = await db.practiceQuestion.findUniqueOrThrow({
        where: { id: state.current!.id },
      });
      assert.equal(snapshot.correctOption, "opcija-1");
      await assert.rejects(
        db.practiceQuestion.update({
          where: { id: snapshot.id },
          data: { prompt: "Changed after start" },
        }),
      );
    });
    await t.test("invalid, forged, foreign and out-of-order answers are rejected", async () => {
      const future = await db.practiceQuestion.findFirstOrThrow({
        where: { attemptId: state.id, position: 1 },
      });
      await assert.rejects(
        answerPractice(db, hash, state.id, { questionId: future.id, optionKey: "opcija-1" }),
        rejects("OUT_OF_ORDER"),
      );
      await assert.rejects(
        answerPractice(db, hash, state.id, { questionId: state.current!.id, optionKey: "missing" }),
        rejects("INVALID_OPTION"),
      );
      await assert.rejects(
        answerPractice(db, hash, state.id, {
          questionId: state.current!.id,
          optionKey: "opcija-1",
          score: 99,
        }),
        rejects("INVALID_INPUT"),
      );
      await assert.rejects(
        answerPractice(db, other, state.id, {
          questionId: state.current!.id,
          optionKey: "opcija-1",
        }),
        rejects("NOT_FOUND"),
      );
    });
    await t.test("concurrent retry of an accepted answer advances exactly once", async () => {
      const answer = { questionId: state.current!.id, optionKey: "opcija-2" };
      const results = await Promise.all(
        Array.from({ length: 4 }, () => answerPractice(db, hash, state.id, answer, { onEvent })),
      );
      assert.ok(results.every((result) => result.answered === 1));
      state = results[0];
      assert.equal(state.feedback?.correct, false);
      assert.equal(state.feedback?.correctOption, "opcija-1");
      await assert.rejects(
        answerPractice(db, hash, state.id, { ...answer, optionKey: "opcija-1" }),
        rejects("ALREADY_ANSWERED"),
      );
      assert.equal(await db.practiceAnswer.count({ where: { questionId: answer.questionId } }), 1);
    });
    await t.test("completion, resume, observer hooks and a new attempt work", async () => {
      while (state.current)
        state = await answerPractice(
          db,
          hash,
          state.id,
          { questionId: state.current.id, optionKey: "opcija-1" },
          { onEvent },
        );
      assert.equal(state.completed, true);
      assert.equal(state.result?.correct, 4);
      assert.equal(state.result?.percent, 80);
      assert.equal(state.result?.answers.length, 5);
      assert.deepEqual(await getPractice(db, hash, state.id), state);
      assert.equal(events.filter((event) => event.name === "practice_started").length, 1);
      assert.equal(events.filter((event) => event.name === "question_answered").length, 5);
      assert.equal(events.filter((event) => event.name === "practice_completed").length, 1);
      assert.equal(new Set(events.map((event) => event.eventId)).size, 7);
      const retry = await startPractice(
        db,
        hash,
        { categoryKey: key, requestId: randomUUID() },
        {
          onEvent: () => {
            throw new Error("Observer failed");
          },
        },
      );
      assert.notEqual(retry.id, state.id);
      assert.equal(retry.answered, 0);
      const revision = await db.practiceQuestion.findFirstOrThrow({
        where: { attemptId: retry.id },
      });
      assert.equal(revision.correctOption, "opcija-2");
    });
    await t.test("demo is opt-in and never accessible when disabled", async () => {
      assert.ok(!(await listPracticeCategories(db)).some((category) => category.demo));
      assert.ok((await listPracticeCategories(db, true)).some((category) => category.demo));
      const input = { categoryKey: demoCategory.key, requestId: randomUUID() };
      await assert.rejects(startPractice(db, hash, input), rejects("NOT_FOUND"));
      const demo = await startPractice(db, hash, input, { allowDemo: true });
      assert.equal(demo.demo, true);
      await assert.rejects(getPractice(db, hash, demo.id), rejects("NOT_FOUND"));
      await assert.rejects(startPractice(db, hash, input), rejects("NOT_FOUND"));
      await assert.rejects(
        answerPractice(db, hash, demo.id, { questionId: demo.current!.id, optionKey: "opcija-1" }),
        rejects("NOT_FOUND"),
      );
    });
    await t.test("24-hour expiry, start quota, session expiry and cleanup", async () => {
      const old = token();
      const past = new Date(+now - 2 * 86_400_000);
      await openGuestSession(db, old, past);
      const expired = await startPractice(
        db,
        old,
        { categoryKey: key, requestId: randomUUID() },
        { now: past },
      );
      await assert.rejects(getPractice(db, old, expired.id, { now }), rejects("ATTEMPT_EXPIRED"));
      const quotaHash = token();
      await openGuestSession(db, quotaHash, now);
      for (let index = 0; index < 10; index++)
        await startPractice(db, quotaHash, { categoryKey: key, requestId: randomUUID() }, { now });
      await assert.rejects(
        startPractice(db, quotaHash, { categoryKey: key, requestId: randomUUID() }, { now }),
        rejects("RATE_LIMIT"),
      );
      const stale = token();
      const staleDate = new Date(+now - 31 * 86_400_000);
      await openGuestSession(db, stale, staleDate);
      const discarded = await startPractice(
        db,
        stale,
        { categoryKey: key, requestId: randomUUID() },
        { now: staleDate },
      );
      await assert.rejects(
        getPractice(db, stale, discarded.id, { now }),
        rejects("SESSION_EXPIRED"),
      );
      await cleanupPractice(db, now);
      assert.equal(await db.guestSession.findUnique({ where: { tokenHash: stale } }), null);
      assert.equal(await db.practiceQuestion.count({ where: { attemptId: discarded.id } }), 0);
      assert.equal((await getPractice(db, hash, state.id)).completed, true);
    });
  } finally {
    await db.$disconnect();
  }
});
