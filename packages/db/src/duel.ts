import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { Client } from "pg";
import { questionSchema } from "@duel/domain";
import {
  DuelError,
  duelRulesSchema,
  duelSnapshotSchema,
  type DuelGame,
  type DuelRules,
} from "@duel/domain/duel";
import { Prisma } from "../generated/client";
import type { Database } from "./client";
import { transaction } from "./transaction";
import { demoCategory, demoQuestions } from "./demo";

const activePhases = ["WAITING", "READY", "ROUND", "ROUND_RESULT"] as const;
const includeGame = {
  players: { orderBy: { seat: "asc" as const } },
  questions: { orderBy: { position: "asc" as const }, include: { answers: true } },
};
type Row = Prisma.DuelGetPayload<{ include: typeof includeGame }>;
export const invitationHash = (token: string) => createHash("sha256").update(token).digest("hex");
const date = (value: number | null) => (value === null ? null : new Date(value));
const millis = (value: Date | null) => value?.getTime() ?? null;

function fromRow(row: Row): DuelGame {
  return {
    id: row.id,
    creatorId: row.creatorId,
    requestId: row.requestId,
    categoryKey: row.categoryKey,
    categoryTitle: row.categoryTitle,
    demo: row.demo,
    phase: row.phase,
    version: row.version,
    roundIndex: row.roundIndex,
    rules: duelRulesSchema.parse(row.rules),
    inviteHash: row.inviteHash,
    inviteToken: null,
    inviteExpiresAt: +row.inviteExpiresAt,
    revealUntil: millis(row.revealUntil),
    reason: row.reason,
    nextDuelId: row.nextDuelId,
    createdAt: +row.createdAt,
    endedAt: millis(row.endedAt),
    players: row.players.map((player) => ({
      guestId: player.guestId,
      seat: player.seat,
      ready: player.ready,
      connected: player.connected,
      disconnectedAt: millis(player.disconnectedAt),
      rematchReady: player.rematchReady,
    })),
    questions: row.questions.map((question) => ({
      ...duelSnapshotSchema.parse(question.snapshot),
      questionRevisionId: question.questionRevisionId,
      opensAt: millis(question.opensAt),
      deadlineAt: millis(question.deadlineAt),
      closedAt: millis(question.closedAt),
      answers: question.answers.map((answer) => ({
        seat: answer.seat,
        optionKey: answer.optionKey,
        correct: answer.correct,
        elapsedMs: answer.elapsedMs,
        receivedAt: +answer.receivedAt,
      })),
    })),
  };
}
function shuffle<T>(values: readonly T[]) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class DuelStore {
  constructor(readonly db: Database) {}

  async authenticate(hash: string, now: number) {
    const guest = await this.db.guestSession.findUnique({ where: { tokenHash: hash } });
    if (!guest || +guest.expiresAt <= now)
      throw new DuelError("SESSION_EXPIRED", "Sesija je istekla. Osveži stranicu.", 401);
    await this.db.guestSession.update({
      where: { id: guest.id },
      data: { lastSeenAt: new Date(now), expiresAt: new Date(now + 30 * 86_400_000) },
    });
    return guest.id;
  }
  async load(id: string) {
    const row = await this.db.duel.findUnique({ where: { id }, include: includeGame });
    return row ? fromRow(row) : null;
  }
  async findRequest(guestId: string, requestId: string) {
    const row = await this.db.duel.findUnique({
      where: { creatorId_requestId: { creatorId: guestId, requestId } },
      include: includeGame,
    });
    return row ? fromRow(row) : null;
  }
  async findInvitation(token: string) {
    return this.db.duel.findUnique({
      where: { inviteHash: invitationHash(token) },
      select: { id: true },
    });
  }
  async create(
    guestId: string,
    categoryKey: string,
    requestId: string,
    rules: DuelRules,
    now: number,
    allowDemo: boolean,
    secondGuestId?: string,
  ) {
    const token = randomBytes(32).toString("hex");
    const game = await transaction(this.db, async (tx) => {
      const replay = await tx.duel.findUnique({
        where: { creatorId_requestId: { creatorId: guestId, requestId } },
        include: includeGame,
      });
      if (replay) return { game: fromRow(replay), fresh: false };
      await tx.guestSession.update({ where: { id: guestId }, data: { lastSeenAt: new Date(now) } });
      const active = await tx.duelPlayer.findFirst({
        where: {
          guestId: { in: [guestId, ...(secondGuestId ? [secondGuestId] : [])] },
          duel: { phase: { in: [...activePhases] } },
        },
      });
      if (active)
        throw new DuelError(
          "ACTIVE_DUEL",
          "Već imaš aktivan duel. Nastavi ga ili sačekaj da istekne.",
          409,
        );
      const recent = await tx.duel.count({
        where: { creatorId: guestId, createdAt: { gte: new Date(now - 60_000) } },
      });
      if (recent >= 10) throw new DuelError("RATE_LIMIT", "Sačekaj minut pre novog izazova.", 429);
      const demo = allowDemo && categoryKey === demoCategory.key;
      const category = demo
        ? null
        : await tx.category.findUnique({
            where: {
              localeId_licenceCategory_key: {
                localeId: "sr-Latn-RS",
                licenceCategory: "B",
                key: categoryKey,
              },
            },
          });
      if (!category && !demo)
        throw new DuelError("NO_CONTENT", "Oblast nije dostupna za duel.", 409);
      const rows = category
        ? await tx.questionRevision.findMany({
            where: { categoryId: category.id, status: "PUBLISHED" },
            orderBy: [{ key: "asc" }, { revision: "desc" }],
          })
        : [];
      const seen = new Set<string>();
      type Source = {
        questionRevisionId: string | null;
        prompt: string;
        explanation: string;
        options: { key: string; text: string }[];
        correctOption: string;
        sources: unknown;
        image: unknown;
      };
      const sources: Source[] = demo
        ? demoQuestions
        : rows
            .filter((row) => {
              if (seen.has(row.key)) return false;
              seen.add(row.key);
              return true;
            })
            .map((row) => {
              const question = questionSchema.parse(row.content);
              return { ...question, questionRevisionId: row.id, image: question.image ?? null };
            });
      if (sources.length < 5)
        throw new DuelError(
          "NO_CONTENT",
          "Za duel je potrebno najmanje pet objavljenih pitanja u oblasti.",
          409,
        );
      const questions = shuffle(sources)
        .slice(0, 5)
        .map((source, position) => {
          const snapshot = duelSnapshotSchema.parse({
            ...source,
            id: randomUUID(),
            position,
            options: shuffle(source.options),
          });
          return {
            id: snapshot.id,
            position,
            questionRevisionId: source.questionRevisionId,
            snapshot,
          };
        });
      const row = await tx.duel.create({
        data: {
          creatorId: guestId,
          requestId,
          categoryKey,
          categoryTitle: category?.title ?? demoCategory.title,
          demo,
          phase: secondGuestId ? "READY" : "WAITING",
          rules,
          inviteHash: secondGuestId ? null : invitationHash(token),
          inviteExpiresAt: new Date(now + 15 * 60_000),
          createdAt: new Date(now),
          players: {
            create: [guestId, ...(secondGuestId ? [secondGuestId] : [])].map((id, seat) => ({
              guestId: id,
              seat,
              disconnectedAt: new Date(now),
            })),
          },
          questions: { create: questions },
        },
        include: includeGame,
      });
      return { game: fromRow(row), fresh: true };
    });
    if (game.fresh && !secondGuestId) game.game.inviteToken = token;
    return game.game;
  }
  async save(next: DuelGame, previous: DuelGame) {
    await transaction(this.db, async (tx) => {
      const updated = await tx.duel.updateMany({
        where: { id: next.id, version: previous.version },
        data: {
          phase: next.phase,
          version: next.version,
          roundIndex: next.roundIndex,
          inviteHash: next.inviteHash,
          revealUntil: date(next.revealUntil),
          reason: next.reason,
          nextDuelId: next.nextDuelId,
          endedAt: date(next.endedAt),
        },
      });
      if (updated.count !== 1)
        throw new DuelError("STATE_CONFLICT", "Stanje duela se promenilo. Osveži stranicu.", 503);
      for (const player of next.players) {
        const old = previous.players.find((item) => item.seat === player.seat);
        if (!old) {
          await tx.guestSession.update({
            where: { id: player.guestId },
            data: { lastSeenAt: new Date() },
          });
          const active = await tx.duelPlayer.findFirst({
            where: {
              guestId: player.guestId,
              duelId: { not: next.id },
              duel: { phase: { in: [...activePhases] } },
            },
          });
          if (active) throw new DuelError("ACTIVE_DUEL", "Već imaš aktivan duel.", 409);
          await tx.duelPlayer.create({
            data: { duelId: next.id, ...player, disconnectedAt: date(player.disconnectedAt) },
          });
        } else if (JSON.stringify(old) !== JSON.stringify(player)) {
          await tx.duelPlayer.update({
            where: { duelId_seat: { duelId: next.id, seat: player.seat } },
            data: {
              ready: player.ready,
              connected: player.connected,
              disconnectedAt: date(player.disconnectedAt),
              rematchReady: player.rematchReady,
            },
          });
        }
      }
      for (const question of next.questions) {
        const old = previous.questions[question.position];
        for (const answer of question.answers) {
          if (!old.answers.some((item) => item.seat === answer.seat))
            await tx.duelAnswer.create({
              data: { questionId: question.id, ...answer, receivedAt: new Date(answer.receivedAt) },
            });
        }
        if (
          question.opensAt !== old.opensAt ||
          question.closedAt !== old.closedAt ||
          question.deadlineAt !== old.deadlineAt
        )
          await tx.duelQuestion.update({
            where: { id: question.id },
            data: {
              opensAt: date(question.opensAt),
              deadlineAt: date(question.deadlineAt),
              closedAt: date(question.closedAt),
            },
          });
      }
    });
  }
  async abortInterrupted(reason: string, now: number) {
    await transaction(this.db, async (tx) => {
      await tx.duel.updateMany({
        where: { phase: { in: [...activePhases] } },
        data: {
          phase: "ABORTED",
          inviteHash: null,
          revealUntil: null,
          reason,
          endedAt: new Date(now),
          version: { increment: 1 },
        },
      });
      await tx.duelPlayer.updateMany({
        where: { connected: true },
        data: { connected: false, disconnectedAt: new Date(now) },
      });
    });
  }
}

// A dedicated session owns the lock; never put a session advisory lock in a pooled query.
export async function acquireDuelLease(connectionString: string, onLost: () => void) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  let released = false;
  client.on("error", () => {
    if (!released) onLost();
  });
  client.on("end", () => {
    if (!released) onLost();
  });
  await client.connect();
  const { rows } = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(193701, 4401) AS locked",
  );
  if (!rows[0].locked) {
    released = true;
    await client.end();
    throw new Error("Another realtime process owns this database");
  }
  return async () => {
    released = true;
    await client.end();
  };
}
