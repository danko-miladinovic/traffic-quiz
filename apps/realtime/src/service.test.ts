import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { io, type Socket } from "socket.io-client";
import { createDatabase } from "@duel/db";
import { importContent } from "@duel/db/content";
import { demoQuestions } from "@duel/db/demo";
import { DuelStore } from "@duel/db/duel";
import { openGuestSession } from "@duel/db/practice";
import { contentBankSchema } from "@duel/domain";
import { type DuelAction, type DuelReply, type DuelView } from "@duel/domain/duel";
import { createDuelService } from "./service";

test(
  "Socket.IO private duels, restart safety, and concurrent-room baseline",
  { timeout: 120_000 },
  async (t) => {
    assert.ok(
      process.env.TEST_DATABASE_URL,
      "TEST_DATABASE_URL must be a disposable migrated PostgreSQL database",
    );
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const db = createDatabase();
    let clock = Date.now();
    const settings = {
      connectionString: process.env.TEST_DATABASE_URL,
      webOrigin: "http://duel.test",
      rules: { questionMs: 1000, revealMs: 100, reconnectMs: 1500, startMs: 10 },
      allowDemo: true,
      now: () => clock,
    };
    let service = await createDuelService(db, settings);
    let port = await service.listen(0);
    const sockets: Socket[] = [];
    const rawTokens = new Map<Socket, string>();
    const guests = new Map<Socket, string>();
    async function connect(token?: string, origin = settings.webOrigin) {
      const raw = token ?? randomBytes(32).toString("hex");
      if (!token) {
        const row = await openGuestSession(
          db,
          createHash("sha256").update(raw).digest("hex"),
          new Date(clock),
        );
        const client = await dial(raw, origin);
        guests.set(client, row.id);
        return client;
      }
      return dial(raw, origin);
    }
    async function dial(raw: string, origin: string) {
      const client = io(`http://127.0.0.1:${port}`, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
        extraHeaders: { Origin: origin, Cookie: `duel_guest=${raw}` },
        autoConnect: false,
      });
      sockets.push(client);
      rawTokens.set(client, raw);
      await new Promise<void>((resolve, reject) => {
        client.once("connect", resolve);
        client.once("connect_error", reject);
        client.connect();
      });
      return client;
    }
    async function reply(client: Socket, event: DuelAction, payload: unknown) {
      return new Promise<DuelReply>((resolve, reject) =>
        client
          .timeout(10_000)
          .emit(event, payload, (error: Error | null, result: DuelReply) =>
            error ? reject(error) : resolve(result),
          ),
      );
    }
    async function ok(client: Socket, event: DuelAction, payload: unknown) {
      const result = await reply(client, event, payload);
      if (!result.ok) assert.fail(`${event}: ${result.error.code} ${result.error.message}`);
      return result.state;
    }
    async function error(client: Socket, event: DuelAction, payload: unknown, code: string) {
      const result = await reply(client, event, payload);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, code);
    }
    async function until(check: () => boolean) {
      for (let index = 0; index < 500; index++) {
        if (check()) return;
        await setTimeout(5);
      }
      assert.fail("Timed out waiting for server state");
    }
    async function pair(categoryKey = "tehnicka-proba") {
      const host = await connect();
      const guest = await connect();
      const state = await ok(host, "duel:create", { categoryKey, requestId: randomUUID() });
      await ok(guest, "duel:join", { token: state.inviteToken });
      return { host, guest, id: state.id };
    }
    async function ready(pairing: { host: Socket; guest: Socket; id: string }) {
      await ok(pairing.host, "duel:ready", { roomId: pairing.id, ready: true });
      const state = await ok(pairing.guest, "duel:ready", { roomId: pairing.id, ready: true });
      clock = state.question!.opensAt + 100;
      return state;
    }
    const key = `duel-fixture-${randomUUID().slice(0, 8)}`;
    const bank = contentBankSchema.parse({
      jurisdiction: "RS",
      locale: "sr-Latn-RS",
      language: "sr",
      script: "Latn",
      licenceCategory: "B",
      categories: [
        {
          key,
          title: "Synthetic duel fixture",
          description: "Automated fixtures only, not educational material.",
        },
      ],
      questions: demoQuestions.map((question, index) => ({
        key: `question-${index}`,
        revision: 1,
        category: key,
        prompt: question.prompt,
        explanation: question.explanation,
        options: question.options,
        correctOption: question.correctOption,
        sources: [
          {
            title: "Synthetic test source",
            url: "https://example.invalid/duel-fixture",
            reference: "Automated test only",
            accessedOn: "2026-11-14",
          },
        ],
        rights: {
          license: "PROJECT-ORIGINAL",
          original: true,
          attribution: "Synthetic automated fixture",
        },
        review: { status: "DRAFT" },
      })),
    });
    try {
      const host = await connect();
      const guest = await connect();
      const outsider = await connect();
      await t.test(
        "published-only selection, host replay, room privacy, full rooms and lease",
        async () => {
          await importContent(db, bank);
          await error(
            host,
            "duel:create",
            { categoryKey: key, requestId: randomUUID() },
            "NO_CONTENT",
          );
          for (const question of bank.questions)
            question.review = {
              status: "PUBLISHED",
              reviewer: "Automated fixture only, not educational review",
              reviewedOn: "2026-11-14",
            };
          await importContent(db, bank, true);
        },
      );
      const input = { categoryKey: key, requestId: randomUUID() };
      let state = await ok(host, "duel:create", input);
      const id = state.id;
      const invite = state.inviteToken;
      await t.test(
        "invitation cannot authorize a third guest or expose private state",
        async () => {
          assert.ok(invite);
          assert.equal((await ok(host, "duel:create", input)).id, id);
          assert.equal((await ok(host, "duel:create", input)).inviteToken, invite);
          await error(
            host,
            "duel:create",
            { categoryKey: key, requestId: randomUUID() },
            "ACTIVE_DUEL",
          );
          await error(outsider, "duel:watch", { roomId: id }, "NOT_FOUND");
          const joined = await ok(guest, "duel:join", { token: invite });
          assert.equal(joined.self, 1);
          assert.equal(joined.inviteToken, null);
          assert.equal((await ok(guest, "duel:join", { token: invite })).players.length, 2);
          await error(outsider, "duel:join", { token: invite }, "ROOM_FULL");
          await error(outsider, "duel:ready", { roomId: id, ready: true }, "NOT_FOUND");
          await assert.rejects(createDuelService(db, settings), /Another realtime process/);
          assert.equal((await db.duel.findUniqueOrThrow({ where: { id } })).phase, "READY");
          await assert.rejects(connect(rawTokens.get(host), "https://untrusted.example"));
          await assert.rejects(connect("a".repeat(64)));
        },
      );
      await t.test(
        "identical frozen questions, hidden correctness, timed answers and duplicate races",
        async () => {
          await ok(host, "duel:ready", { roomId: id, ready: true });
          state = await ok(guest, "duel:ready", { roomId: id, ready: true });
          const hostView = await ok(host, "duel:watch", { roomId: id });
          assert.deepEqual(hostView.question, state.question);
          assert.equal("correctOption" in state.question!, false);
          assert.equal(state.feedback, null);
          for (const question of bank.questions) {
            question.revision = 2;
            question.prompt += " Updated revision.";
            question.correctOption = "opcija-2";
          }
          await importContent(db, bank, true);
          assert.deepEqual((await ok(host, "duel:watch", { roomId: id })).question, state.question);
          await error(
            host,
            "duel:answer",
            { roomId: id, round: 0, optionKey: "opcija-1" },
            "NOT_STARTED",
          );
          clock = state.question!.opensAt + 100;
          await error(
            host,
            "duel:answer",
            { roomId: id, round: 0, optionKey: "opcija-1", elapsedMs: 0 },
            "INVALID_INPUT",
          );
          await error(
            host,
            "duel:answer",
            { roomId: id, round: 1, optionKey: "opcija-1" },
            "ROUND_CLOSED",
          );
          await error(
            host,
            "duel:answer",
            { roomId: id, round: 0, optionKey: "missing" },
            "INVALID_OPTION",
          );
          const answer = { roomId: id, round: 0, optionKey: "opcija-1" };
          const results = await Promise.all([
            ok(host, "duel:answer", answer),
            ok(host, "duel:answer", answer),
          ]);
          assert.ok(results.every((result) => result.players[0].answered));
          assert.equal((await ok(guest, "duel:watch", { roomId: id })).players[0].correct, 0);
          await error(
            host,
            "duel:answer",
            { ...answer, optionKey: "opcija-2" },
            "ALREADY_ANSWERED",
          );
          state = await ok(guest, "duel:answer", answer);
          assert.equal(state.phase, "ROUND_RESULT");
          assert.equal(state.feedback?.question.correctOption, "opcija-1");
          assert.equal(state.players[0].elapsedMs, 100);
          const saved = await db.duelAnswer.findMany({
            where: { question: { duelId: id, position: 0 } },
          });
          assert.equal(saved.length, 2);
          await assert.rejects(
            db.duelAnswer.update({
              where: { questionId_seat: { questionId: saved[0].questionId, seat: saved[0].seat } },
              data: { optionKey: "opcija-2" },
            }),
          );
          for (let round = 1; round < 5; round++) {
            clock += settings.rules.revealMs;
            await service.engine.tick();
            state = await ok(host, "duel:watch", { roomId: id });
            clock = state.question!.opensAt + 100;
            await Promise.all([
              ok(host, "duel:answer", { roomId: id, round, optionKey: "opcija-1" }),
              ok(guest, "duel:answer", { roomId: id, round, optionKey: "opcija-1" }),
            ]);
          }
          clock += settings.rules.revealMs;
          await service.engine.tick();
          state = await ok(host, "duel:watch", { roomId: id });
          const opponent = await ok(guest, "duel:watch", { roomId: id });
          assert.equal(state.phase, "FINISHED");
          assert.deepEqual(state.result, opponent.result);
          assert.equal(state.result?.winner, null);
          assert.equal(state.players[0].correct, 5);
          assert.equal((await db.duel.findUniqueOrThrow({ where: { id } })).phase, "FINISHED");
        },
      );
      await t.test("mutual rematch creates exactly one fresh duel", async () => {
        const first = await ok(host, "duel:rematch", { roomId: id });
        assert.equal(first.nextDuelId, null);
        await ok(host, "duel:leave", { roomId: id });
        const waiting = await ok(guest, "duel:rematch", { roomId: id });
        assert.equal(waiting.nextDuelId, null);
        const returned = await ok(host, "duel:watch", { roomId: id });
        assert.equal(returned.players[0].rematchReady, false);
        const second = await ok(host, "duel:rematch", { roomId: id });
        assert.ok(second.nextDuelId);
        assert.equal(
          (await ok(host, "duel:rematch", { roomId: id })).nextDuelId,
          second.nextDuelId,
        );
        const child = await ok(host, "duel:watch", { roomId: second.nextDuelId });
        await ok(guest, "duel:watch", { roomId: child.id });
        assert.equal(child.phase, "READY");
        assert.equal(child.roundIndex, -1);
        await ok(host, "duel:leave", { roomId: child.id });
      });
      await t.test(
        "reconnect preserves deadlines; timeouts and failed grace periods abort safely",
        async () => {
          const pairing = await pair();
          const started = await ready(pairing);
          const deadline = started.question!.deadlineAt!;
          pairing.guest.disconnect();
          await until(() => service.engine.rooms.get(pairing.id)?.players[1].connected === false);
          clock += 100;
          const resumed = await connect(rawTokens.get(pairing.guest));
          const restored = await ok(resumed, "duel:watch", { roomId: pairing.id });
          assert.equal(restored.question?.deadlineAt, deadline);
          clock = deadline;
          await service.engine.tick();
          await error(
            resumed,
            "duel:answer",
            { roomId: pairing.id, round: 0, optionKey: "opcija-1" },
            "ROUND_CLOSED",
          );
          const timedOut = await ok(pairing.host, "duel:watch", { roomId: pairing.id });
          assert.equal(
            timedOut.feedback?.answers.every((answer) => answer.optionKey === null),
            true,
          );
          resumed.disconnect();
          await until(() => service.engine.rooms.get(pairing.id)?.players[1].connected === false);
          clock += settings.rules.reconnectMs;
          await service.engine.tick();
          const aborted = await ok(pairing.host, "duel:watch", { roomId: pairing.id });
          assert.equal(aborted.phase, "ABORTED");
          assert.equal(aborted.result, null);
        },
      );
      await t.test("expired invitations cannot be joined", async () => {
        const client = await connect();
        const waiting = await ok(client, "duel:create", {
          categoryKey: "tehnicka-proba",
          requestId: randomUUID(),
        });
        clock = waiting.inviteExpiresAt;
        await service.engine.tick();
        await error(outsider, "duel:join", { token: waiting.inviteToken }, "INVITE_INVALID");
        assert.equal((await ok(client, "duel:watch", { roomId: waiting.id })).phase, "EXPIRED");
      });
      await t.test(
        "twenty concurrent rooms complete without cross-room state leakage",
        async () => {
          const latencies: number[] = [];
          const started = performance.now();
          const rooms = await Promise.all(Array.from({ length: 20 }, () => pair()));
          await Promise.all(
            rooms.map(async (room) => {
              await ok(room.host, "duel:ready", { roomId: room.id, ready: true });
              await ok(room.guest, "duel:ready", { roomId: room.id, ready: true });
            }),
          );
          for (let round = 0; round < 5; round++) {
            clock += 120;
            await Promise.all(
              rooms.flatMap((room) =>
                [room.host, room.guest].map(async (client) => {
                  const start = performance.now();
                  const response = await ok(client, "duel:answer", {
                    roomId: room.id,
                    round,
                    optionKey: "opcija-1",
                  });
                  latencies.push(performance.now() - start);
                  assert.equal(response.id, room.id);
                }),
              ),
            );
            clock += settings.rules.revealMs;
            await service.engine.tick();
          }
          for (const room of rooms) {
            const result = await ok(room.host, "duel:watch", { roomId: room.id });
            assert.equal(result.phase, "FINISHED");
            assert.equal(result.players[0].correct, 5);
          }
          latencies.sort((a, b) => a - b);
          t.diagnostic(
            `20-room baseline: ${Math.round(performance.now() - started)}ms total; accepted-answer acknowledgement p95 ${Math.round(latencies[Math.floor(latencies.length * 0.95)])}ms. Local test only, not a hosting capacity promise.`,
          );
        },
      );
      await t.test(
        "restart reconciliation aborts interrupted records and preserves finished results",
        async () => {
          await service.close();
          sockets.forEach((client) => client.disconnect());
          const hostId = guests.get(host)!;
          const interrupted = await new DuelStore(db).create(
            hostId,
            "tehnicka-proba",
            randomUUID(),
            settings.rules,
            clock,
            true,
          );
          service = await createDuelService(db, { ...settings, allowDemo: false });
          port = await service.listen(0);
          const row = await db.duel.findUniqueOrThrow({ where: { id: interrupted.id } });
          assert.equal(row.phase, "ABORTED");
          assert.equal(row.reason, "SERVER_RESTART");
          assert.equal(row.inviteHash, null);
          const owner = await connect(rawTokens.get(host));
          await error(owner, "duel:watch", { roomId: interrupted.id }, "NOT_FOUND"); // Demo is disabled in this restart.
          const finished = await ok(owner, "duel:watch", { roomId: id });
          assert.equal(finished.phase, "FINISHED");
          assert.equal(finished.result?.rounds.length, 5);
          await error(
            owner,
            "duel:create",
            { categoryKey: "tehnicka-proba", requestId: randomUUID() },
            "NO_CONTENT",
          );
        },
      );
    } finally {
      sockets.forEach((client) => client.disconnect());
      await service.close();
      await db.$disconnect();
    }
  },
);
