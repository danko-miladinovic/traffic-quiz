import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  answerDuel,
  duelAnswerSchema,
  DuelError,
  duelScores,
  duelView,
  duelWinner,
  readyDuel,
  tickDuel,
  type DuelGame,
} from "./duel";

function game(): DuelGame {
  return {
    id: randomUUID(),
    creatorId: "private-host",
    requestId: randomUUID(),
    categoryKey: "fixture",
    categoryTitle: "Synthetic",
    demo: true,
    phase: "READY",
    version: 0,
    roundIndex: -1,
    rules: { questionMs: 1000, revealMs: 100, reconnectMs: 3000, startMs: 10 },
    inviteHash: "private-hash",
    inviteToken: "invitation-only",
    inviteExpiresAt: 100_000,
    revealUntil: null,
    reason: null,
    nextDuelId: null,
    createdAt: 0,
    endedAt: null,
    players: ["private-host", "private-guest"].map((guestId, seat) => ({
      guestId,
      seat,
      ready: false,
      connected: true,
      disconnectedAt: null,
      rematchReady: false,
    })),
    questions: Array.from({ length: 5 }, (_, position) => ({
      id: randomUUID(),
      position,
      questionRevisionId: null,
      prompt: `Synthetic question ${position}`,
      options: [
        { key: "correct", text: "A" },
        { key: "wrong", text: "B" },
      ],
      correctOption: "correct",
      explanation: "Synthetic explanation",
      sources: [],
      image: null,
      opensAt: null,
      deadlineAt: null,
      closedAt: null,
      answers: [],
    })),
  };
}
function ready(state: DuelGame, now = 100) {
  readyDuel(state, "private-host", true, now);
  readyDuel(state, "private-guest", true, now);
}

test("duel accuracy outranks speed; speed resolves accuracy ties; exact ties draw", () => {
  assert.equal(
    duelWinner([
      { correct: 3, elapsedMs: 9000 },
      { correct: 2, elapsedMs: 50 },
    ]),
    0,
  );
  assert.equal(
    duelWinner([
      { correct: 3, elapsedMs: 90 },
      { correct: 3, elapsedMs: 50 },
    ]),
    1,
  );
  assert.equal(
    duelWinner([
      { correct: 0, elapsedMs: 0 },
      { correct: 0, elapsedMs: 0 },
    ]),
    null,
  );
});
test("simultaneous reveal, hidden answer keys, private identities and idempotent answers", () => {
  const state = game();
  ready(state);
  assert.equal(state.phase, "ROUND");
  assert.throws(
    () => answerDuel(state, "private-host", 0, "correct", 105),
    (error) => error instanceof DuelError && error.code === "NOT_STARTED",
  );
  answerDuel(state, "private-host", 0, "correct", 150);
  answerDuel(state, "private-host", 0, "correct", 155);
  assert.equal(state.questions[0].answers.length, 1);
  const before = duelView(state, "private-guest", 155);
  assert.equal("correctOption" in before.question!, false);
  assert.equal(before.feedback, null);
  assert.equal(before.result, null);
  assert.equal(before.players[0].correct, 0);
  assert.equal(before.inviteToken, null);
  assert.ok(!JSON.stringify(before).includes("private-host"));
  assert.ok(!JSON.stringify(before).includes("private-hash"));
  assert.throws(
    () => answerDuel(state, "private-host", 0, "wrong", 160),
    (error) => error instanceof DuelError && error.code === "ALREADY_ANSWERED",
  );
  answerDuel(state, "private-guest", 0, "wrong", 170);
  assert.equal(state.phase, "ROUND_RESULT");
  const after = duelView(state, "private-guest", 170);
  assert.equal(after.feedback?.question.correctOption, "correct");
  assert.equal(after.players[0].correct, 1);
  assert.equal(after.players[0].elapsedMs, 40);
  assert.equal(after.players[1].elapsedMs, 0);
  const order = structuredClone(state.questions[1].options);
  tickDuel(state, 270);
  assert.equal(state.roundIndex, 1);
  assert.deepEqual(state.questions[1].options, order);
});
test("five shared rounds finish with identical results and a true tie", () => {
  const state = game();
  ready(state);
  for (let index = 0; index < 5; index++) {
    const time = state.questions[index].opensAt! + 100;
    answerDuel(state, "private-host", index, "correct", time);
    answerDuel(state, "private-guest", index, "correct", time);
    tickDuel(state, time + state.rules.revealMs);
  }
  assert.equal(state.phase, "FINISHED");
  const host = duelView(state, "private-host", 9999);
  const guest = duelView(state, "private-guest", 9999);
  assert.deepEqual(host.result, guest.result);
  assert.equal(host.result?.winner, null);
  assert.equal(host.result?.rounds.length, 5);
  assert.deepEqual(duelScores(state), [
    { correct: 5, elapsedMs: 500 },
    { correct: 5, elapsedMs: 500 },
  ]);
});
test("deadlines survive reconnects; failed reconnects abort without a winner", () => {
  const state = game();
  ready(state);
  const deadline = state.questions[0].deadlineAt!;
  state.players[1].connected = false;
  state.players[1].disconnectedAt = 500;
  tickDuel(state, deadline);
  assert.equal(state.phase, "ROUND_RESULT");
  assert.equal(state.questions[0].answers.length, 0);
  tickDuel(state, deadline + 200);
  assert.equal(state.phase, "ROUND_RESULT"); // Wait for the absent player, not a forfeit win.
  state.players[1].connected = true;
  state.players[1].disconnectedAt = null;
  tickDuel(state, deadline + 201);
  assert.equal(state.roundIndex, 1);
  assert.equal(state.questions[0].deadlineAt, deadline);
  state.players[1].connected = false;
  state.players[1].disconnectedAt = deadline + 210;
  tickDuel(state, deadline + 3210);
  assert.equal(state.phase, "ABORTED");
  assert.equal(duelView(state, "private-host", deadline + 3210).result, null);
});
test("expired invitations and forged socket payloads are rejected", () => {
  const state = game();
  state.phase = "WAITING";
  state.players.pop();
  tickDuel(state, state.inviteExpiresAt);
  assert.equal(state.phase, "EXPIRED");
  assert.equal(state.inviteHash, null);
  assert.equal(state.inviteToken, null);
  assert.equal(
    duelAnswerSchema.safeParse({
      roomId: state.id,
      round: 0,
      optionKey: "correct",
      elapsedMs: 1,
      guestId: "private-host",
    }).success,
    false,
  );
});
