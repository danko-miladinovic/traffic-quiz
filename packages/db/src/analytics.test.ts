import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabase } from "./client";
import {
  analyticsHash,
  bindAnalytics,
  browserAnalytics,
  cleanupAnalytics,
  consentVisitor,
  analyticsReport,
  revokeVisitor,
  invitationAnalytics,
  summarizeAnalytics,
} from "./analytics";
import { openGuestSession, startPractice, answerPractice } from "./practice";
import { DuelStore } from "./duel";
import { answerDuel, readyDuel, tickDuel, defaultDuelRules } from "@duel/domain/duel";

const url = process.env.TEST_DATABASE_URL;
test(
  "controlled consenting session reconciles reports, retries, room lifecycle, withdrawal and retention",
  { skip: !url },
  async () => {
    process.env.DATABASE_URL = url!;
    const db = createDatabase();
    const now = new Date();
    const from = new Date(+now - 1000),
      to = new Date(+now + 2 * 86400000);
    const guestHash = analyticsHash(randomBytes(32).toString("hex"));
    const tokenHash = analyticsHash(randomBytes(32).toString("hex"));
    try {
      const guest = await openGuestSession(db, guestHash, now);
      await consentVisitor(db, tokenHash, now);
      await bindAnalytics(db, guestHash, tokenHash, now);
      const visitor = await db.analyticsVisitor.findUniqueOrThrow({ where: { tokenHash } });
      const pageInput = {
        name: "page_view" as const,
        key: randomUUID(),
        page: "/vezbanje",
        source: "organic" as const,
      };
      await Promise.all([
        browserAnalytics(db, tokenHash, pageInput, now),
        browserAnalytics(db, tokenHash, pageInput, now),
      ]);
      let attempt = await startPractice(
        db,
        guestHash,
        { categoryKey: "tehnicka-proba", requestId: randomUUID() },
        { allowDemo: true, analytics: true, now },
      );
      while (attempt.current) {
        const question = attempt.current;
        const answer = { questionId: question.id, optionKey: question.options[0].key };
        await Promise.all([
          answerPractice(db, guestHash, attempt.id, answer, {
            allowDemo: true,
            analytics: true,
            now,
          }),
          answerPractice(db, guestHash, attempt.id, answer, {
            allowDemo: true,
            analytics: true,
            now,
          }),
        ]);
        attempt = await answerPractice(db, guestHash, attempt.id, answer, {
          allowDemo: true,
          analytics: true,
          now,
        });
      }
      const events = await db.analyticsEvent.findMany({
        where: { visitorId: visitor.id },
        include: { visit: true },
      });
      const counts = summarizeAnalytics(events);
      assert.equal(counts.pageViews, 1);
      assert.equal(counts.visits, 1);
      assert.equal(counts.activeUsers, 1);
      assert.equal(counts.events.practice_started, 1);
      assert.equal(counts.events.practice_completed, 1);
      assert.equal(counts.events.question_answered, 5);
      assert.equal(counts.practiceCompletionRate, 1);
      assert.equal(counts.averageAnswersPerVisit, 5);
      assert.equal(counts.traffic.organic, 1);
      assert.equal(JSON.stringify(events).includes("optionKey"), false);
      const otherHash = analyticsHash(randomBytes(32).toString("hex"));
      const other = await openGuestSession(db, otherHash, now);
      const otherAnalytics = analyticsHash(randomUUID());
      await consentVisitor(db, otherAnalytics, now);
      await bindAnalytics(db, otherHash, otherAnalytics, now);
      const store = new DuelStore(db, true);
      let game = await store.create(
        guest.id,
        "tehnicka-proba",
        randomUUID(),
        { ...defaultDuelRules, startMs: 100, revealMs: 100 },
        +now,
        true,
      );
      const invitationId = randomUUID();
      await invitationAnalytics(db, tokenHash, guestHash, game.id, invitationId, now);
      await invitationAnalytics(db, tokenHash, guestHash, game.id, invitationId, now);
      await assert.rejects(() =>
        invitationAnalytics(db, tokenHash, otherHash, game.id, randomUUID(), now),
      );
      let previous = structuredClone(game);
      game.players.push({
        guestId: other.id,
        seat: 1,
        ready: false,
        connected: true,
        disconnectedAt: null,
        rematchReady: false,
      });
      game.players[0].connected = true;
      game.players[0].disconnectedAt = null;
      game.phase = "READY";
      game.version++;
      await store.save(game, previous);
      previous = structuredClone(game);
      readyDuel(game, guest.id, true, +now);
      readyDuel(game, other.id, true, +now);
      game.version++;
      await store.save(game, previous);
      for (let round = 0; round < 5; round++) {
        previous = structuredClone(game);
        const opensAt = game.questions[round].opensAt!;
        answerDuel(game, guest.id, round, game.questions[round].options[0].key, opensAt + 10);
        answerDuel(game, other.id, round, game.questions[round].options[0].key, opensAt + 20);
        game.version++;
        await store.save(game, previous);
        previous = structuredClone(game);
        tickDuel(game, game.revealUntil! + 1);
        game.version++;
        await store.save(game, previous);
      }
      assert.equal(game.phase, "FINISHED");
      previous = structuredClone(game);
      game.players[0].rematchReady = true;
      game.version++;
      await store.save(game, previous);
      previous = structuredClone(game);
      game.players[0].rematchReady = false;
      game.version++;
      await store.save(game, previous);
      previous = structuredClone(game);
      game.players[0].rematchReady = true;
      game.version++;
      await store.save(game, previous);
      const roomEvents = await db.analyticsEvent.findMany({
        where: { resourceKey: analyticsHash(game.id) },
      });
      assert.equal(roomEvents.filter((event) => event.name === "duel_completed").length, 1);
      assert.equal(roomEvents.filter((event) => event.name === "duel_started").length, 1);
      assert.equal(roomEvents.filter((event) => event.name === "invite_action").length, 1);
      assert.equal(roomEvents.filter((event) => event.name === "rematch_requested").length, 1);
      assert.equal(roomEvents.filter((event) => event.name === "question_answered").length, 10);
      assert.ok(!JSON.stringify(roomEvents).includes(game.inviteToken ?? "NEVER_A_MATCH"));
      await browserAnalytics(
        db,
        tokenHash,
        { ...pageInput, key: randomUUID() },
        new Date(+now + 31 * 60000),
      );
      const reportRows = await db.analyticsEvent.findMany({
        where: { visitorId: visitor.id },
        include: { visit: true },
      });
      const report = summarizeAnalytics(reportRows);
      assert.equal(report.visits, 2);
      assert.equal(report.returningVisitors, 1);
      assert.equal(report.invitationRate, 1);
      assert.equal((await analyticsReport(db, from, to, true)).events.duel_completed >= 1, true);
      const before = await db.analyticsEvent.count({ where: { visitorId: visitor.id } });
      await startPractice(
        db,
        guestHash,
        { categoryKey: "tehnicka-proba", requestId: randomUUID() },
        { allowDemo: true, now },
      );
      assert.equal(await db.analyticsEvent.count({ where: { visitorId: visitor.id } }), before);
      await cleanupAnalytics(db, now);
      assert.ok(await db.analyticsAggregate.count());
      await revokeVisitor(db, tokenHash);
      assert.equal(await db.analyticsEvent.count({ where: { visitorId: visitor.id } }), 0);
      assert.equal(
        (await db.guestSession.findUniqueOrThrow({ where: { id: guest.id } })).analyticsVisitorId,
        null,
      );
      // Retention deletes identifiers/events, preserves bounded identifier-free aggregates.
      const old = new Date(+now - 50 * 86400000);
      const expiredToken = analyticsHash(randomUUID());
      await consentVisitor(db, expiredToken, old);
      await browserAnalytics(
        db,
        expiredToken,
        { name: "page_view", key: randomUUID(), page: "/" },
        old,
      );
      await cleanupAnalytics(db, now);
      assert.equal(
        await db.analyticsVisitor.findUnique({ where: { tokenHash: expiredToken } }),
        null,
      );
    } finally {
      await db.$disconnect();
    }
  },
);

test("monthly unique and invitation metrics cannot be formed by summing daily users or actions", () => {
  const visit = { source: "direct", returning: false };
  const firstDay = [
    {
      visitorId: "one",
      visitId: "visit-one",
      name: "duel_created",
      resourceKey: "room-one",
      demo: false,
      visit,
    },
  ];
  const nextDay = [
    {
      visitorId: "one",
      visitId: "visit-two",
      name: "duel_created",
      resourceKey: "room-two",
      demo: false,
      visit: { ...visit, returning: true },
    },
    {
      visitorId: "one",
      visitId: "visit-two",
      name: "invite_action",
      resourceKey: "room-two",
      demo: false,
      visit: { ...visit, returning: true },
    },
    {
      visitorId: "one",
      visitId: "visit-two",
      name: "invite_action",
      resourceKey: "room-two",
      demo: false,
      visit: { ...visit, returning: true },
    },
  ];
  assert.equal(
    summarizeAnalytics(firstDay).activeUsers + summarizeAnalytics(nextDay).activeUsers,
    2,
  );
  const month = summarizeAnalytics([...firstDay, ...nextDay]);
  assert.equal(month.activeUsers, 1);
  assert.equal(month.visits, 2);
  assert.equal(month.invitationRate, 1);
  assert.equal(month.distinctInvitingCreators, 1);
});
