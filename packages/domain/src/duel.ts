import { z } from "zod";
import {
  PracticeError,
  practiceOptionsSchema,
  practiceImageSchema,
  practiceSourcesSchema,
} from "./practice";

export class DuelError extends PracticeError {}
const roomId = z.uuid();
export const duelRoomSchema = z.strictObject({ roomId });
export const duelCreateSchema = z.strictObject({
  categoryKey: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  requestId: z.uuid(),
});
export const duelJoinSchema = z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const duelReadySchema = z.strictObject({ roomId, ready: z.boolean() });
export const duelAnswerSchema = z.strictObject({
  roomId,
  round: z.number().int().min(0).max(4),
  optionKey: z.string().min(1).max(100),
});
export const duelRulesSchema = z.object({
  questionMs: z.number().int().min(100).max(120_000),
  revealMs: z.number().int().min(0).max(30_000),
  reconnectMs: z.number().int().min(100).max(60_000),
  startMs: z.number().int().min(0).max(5000),
});
export type DuelRules = z.infer<typeof duelRulesSchema>;
export const defaultDuelRules: DuelRules = {
  questionMs: 20_000,
  revealMs: 4000,
  reconnectMs: 20_000,
  startMs: 1000,
};
export const duelSnapshotSchema = z.object({
  id: z.uuid(),
  position: z.number().int().min(0).max(4),
  prompt: z.string(),
  options: practiceOptionsSchema,
  image: practiceImageSchema.nullable(),
  correctOption: z.string(),
  explanation: z.string(),
  sources: practiceSourcesSchema,
});
export type DuelSnapshot = z.infer<typeof duelSnapshotSchema>;
export type DuelAnswer = {
  seat: number;
  optionKey: string;
  correct: boolean;
  elapsedMs: number;
  receivedAt: number;
};
export type DuelQuestion = DuelSnapshot & {
  questionRevisionId: string | null;
  opensAt: number | null;
  deadlineAt: number | null;
  closedAt: number | null;
  answers: DuelAnswer[];
};
export type DuelPlayer = {
  guestId: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  rematchReady: boolean;
};
export type DuelPhase =
  "WAITING" | "READY" | "ROUND" | "ROUND_RESULT" | "FINISHED" | "EXPIRED" | "ABORTED";
// Internal server state. Never serialize this object to a socket or HTTP response.
export type DuelGame = {
  id: string;
  creatorId: string;
  requestId: string;
  categoryKey: string;
  categoryTitle: string;
  demo: boolean;
  phase: DuelPhase;
  version: number;
  roundIndex: number;
  rules: DuelRules;
  inviteHash: string | null;
  inviteToken: string | null;
  inviteExpiresAt: number;
  revealUntil: number | null;
  reason: string | null;
  nextDuelId: string | null;
  createdAt: number;
  endedAt: number | null;
  players: DuelPlayer[];
  questions: DuelQuestion[];
};
export type DuelPublicQuestion = Pick<
  DuelSnapshot,
  "id" | "position" | "prompt" | "options" | "image"
> & { opensAt: number; deadlineAt: number };
export type DuelRoundFeedback = {
  question: DuelSnapshot;
  answers: { seat: number; optionKey: string | null; correct: boolean; elapsedMs: number | null }[];
};
export type DuelView = {
  id: string;
  version: number;
  phase: DuelPhase;
  self: number;
  categoryKey: string;
  categoryTitle: string;
  demo: boolean;
  serverNow: number;
  rules: DuelRules;
  inviteToken: string | null;
  inviteExpiresAt: number;
  roundIndex: number;
  question: DuelPublicQuestion | null;
  feedback: DuelRoundFeedback | null;
  players: {
    seat: number;
    ready: boolean;
    connected: boolean;
    answered: boolean;
    rematchReady: boolean;
    correct: number;
    elapsedMs: number;
    reconnectUntil: number | null;
  }[];
  result: { winner: number | null; rounds: DuelRoundFeedback[] } | null;
  reason: string | null;
  nextDuelId: string | null;
};
export type DuelReply =
  { ok: true; state: DuelView } | { ok: false; error: { code: string; message: string } };
export type DuelAction =
  | "duel:create"
  | "duel:join"
  | "duel:watch"
  | "duel:ready"
  | "duel:answer"
  | "duel:rematch"
  | "duel:leave";

export const terminalDuel = (game: Pick<DuelGame, "phase">) =>
  ["FINISHED", "EXPIRED", "ABORTED"].includes(game.phase);
export function duelPlayer(game: DuelGame, guestId: string) {
  const player = game.players.find((item) => item.guestId === guestId);
  if (!player) throw new DuelError("NOT_FOUND", "Duel nije pronađen.", 404);
  return player;
}
export function endDuel(game: DuelGame, phase: "ABORTED" | "EXPIRED", reason: string, now: number) {
  if (terminalDuel(game)) return;
  game.phase = phase;
  game.reason = reason;
  game.endedAt = now;
  game.inviteHash = null;
  game.inviteToken = null;
  game.revealUntil = null;
}
function startRound(game: DuelGame, now: number) {
  game.phase = "ROUND";
  game.roundIndex++;
  const question = game.questions[game.roundIndex];
  question.opensAt = now + game.rules.startMs;
  question.deadlineAt = question.opensAt + game.rules.questionMs;
  game.revealUntil = null;
  game.inviteHash = null;
  game.inviteToken = null;
}
function closeRound(game: DuelGame, now: number) {
  game.questions[game.roundIndex].closedAt = now;
  game.phase = "ROUND_RESULT";
  game.revealUntil = now + game.rules.revealMs;
}
export function tickDuel(game: DuelGame, now: number) {
  if (terminalDuel(game)) return;
  if ((game.phase === "WAITING" || game.phase === "READY") && now >= game.inviteExpiresAt) {
    endDuel(game, "EXPIRED", "INVITE_EXPIRED", now);
    return;
  }
  if (
    game.players.some(
      (player) =>
        !player.connected &&
        player.disconnectedAt !== null &&
        now >= player.disconnectedAt + game.rules.reconnectMs,
    )
  ) {
    endDuel(game, "ABORTED", "PLAYER_DISCONNECTED", now);
    return;
  }
  if (game.phase === "ROUND" && now >= game.questions[game.roundIndex].deadlineAt!)
    closeRound(game, now);
  if (
    game.phase === "ROUND_RESULT" &&
    now >= game.revealUntil! &&
    game.players.length === 2 &&
    game.players.every((player) => player.connected)
  ) {
    if (game.roundIndex === 4) {
      game.phase = "FINISHED";
      game.endedAt = now;
      game.revealUntil = null;
    } else startRound(game, now);
  }
}
export function readyDuel(game: DuelGame, guestId: string, ready: boolean, now: number) {
  const player = duelPlayer(game, guestId);
  if (player.ready === ready && !["WAITING", "READY"].includes(game.phase)) return;
  if (!["WAITING", "READY"].includes(game.phase))
    throw new DuelError("ALREADY_STARTED", "Duel je već pokrenut ili završen.", 409);
  player.ready = ready;
  if (game.players.length === 2 && game.players.every((item) => item.ready && item.connected))
    startRound(game, now);
}
export function answerDuel(
  game: DuelGame,
  guestId: string,
  round: number,
  optionKey: string,
  receivedAt: number,
) {
  const player = duelPlayer(game, guestId);
  const question = game.questions[round];
  if (!question) throw new DuelError("INVALID_INPUT", "Pitanje nije ispravno.", 400);
  const previous = question.answers.find((answer) => answer.seat === player.seat);
  if (previous) {
    if (previous.optionKey !== optionKey)
      throw new DuelError("ALREADY_ANSWERED", "Odgovor je već potvrđen.", 409);
    return;
  }
  if (game.phase !== "ROUND" || game.roundIndex !== round || question.closedAt !== null)
    throw new DuelError("ROUND_CLOSED", "Ovo pitanje više nije aktivno.", 409);
  if (receivedAt < question.opensAt!)
    throw new DuelError("NOT_STARTED", "Sačekaj početak pitanja.", 409);
  if (receivedAt >= question.deadlineAt!)
    throw new DuelError("ROUND_CLOSED", "Vreme za odgovor je isteklo.", 409);
  if (!question.options.some((option) => option.key === optionKey))
    throw new DuelError("INVALID_OPTION", "Izaberi ponuđeni odgovor.", 400);
  question.answers.push({
    seat: player.seat,
    optionKey,
    correct: optionKey === question.correctOption,
    elapsedMs: Math.floor(receivedAt - question.opensAt!),
    receivedAt,
  });
  if (question.answers.length === 2) closeRound(game, receivedAt);
}
export function duelScores(game: DuelGame) {
  return [0, 1].map((seat) => {
    const answers = game.questions
      .filter((question) => question.closedAt !== null)
      .flatMap((question) =>
        question.answers.filter((answer) => answer.seat === seat && answer.correct),
      );
    return {
      correct: answers.length,
      elapsedMs: answers.reduce((sum, answer) => sum + answer.elapsedMs, 0),
    };
  });
}
export function duelWinner(scores: ReturnType<typeof duelScores>): number | null {
  if (scores[0].correct !== scores[1].correct) return scores[0].correct > scores[1].correct ? 0 : 1;
  if (scores[0].elapsedMs !== scores[1].elapsedMs)
    return scores[0].elapsedMs < scores[1].elapsedMs ? 0 : 1;
  return null;
}
function feedback(question: DuelQuestion): DuelRoundFeedback {
  const {
    questionRevisionId: _revision,
    opensAt: _opens,
    deadlineAt: _deadline,
    closedAt: _closed,
    answers,
    ...snapshot
  } = question;
  return {
    question: snapshot,
    answers: [0, 1].map((seat) => {
      const answer = answers.find((item) => item.seat === seat);
      return {
        seat,
        optionKey: answer?.optionKey ?? null,
        correct: answer?.correct ?? false,
        elapsedMs: answer?.elapsedMs ?? null,
      };
    }),
  };
}
export function duelView(game: DuelGame, guestId: string, now: number): DuelView {
  const self = duelPlayer(game, guestId).seat;
  const current = game.questions[game.roundIndex];
  const scores = duelScores(game);
  const closed = game.questions.filter((question) => question.closedAt !== null);
  return {
    id: game.id,
    version: game.version,
    phase: game.phase,
    self,
    categoryKey: game.categoryKey,
    categoryTitle: game.categoryTitle,
    demo: game.demo,
    serverNow: now,
    rules: game.rules,
    inviteToken: self === 0 && ["WAITING", "READY"].includes(game.phase) ? game.inviteToken : null,
    inviteExpiresAt: game.inviteExpiresAt,
    roundIndex: game.roundIndex,
    question:
      game.phase === "ROUND" && current
        ? {
            id: current.id,
            position: current.position,
            prompt: current.prompt,
            options: current.options,
            image: current.image,
            opensAt: current.opensAt!,
            deadlineAt: current.deadlineAt!,
          }
        : null,
    feedback: closed.length ? feedback(closed[closed.length - 1]) : null,
    players: game.players.map((player) => ({
      seat: player.seat,
      ready: player.ready,
      connected: player.connected,
      answered: current?.answers.some((answer) => answer.seat === player.seat) ?? false,
      rematchReady: player.rematchReady,
      ...scores[player.seat],
      reconnectUntil:
        !terminalDuel(game) && !player.connected && player.disconnectedAt !== null
          ? player.disconnectedAt + game.rules.reconnectMs
          : null,
    })),
    result:
      game.phase === "FINISHED"
        ? { winner: duelWinner(scores), rounds: closed.map(feedback) }
        : null,
    reason: game.reason,
    nextDuelId: game.nextDuelId,
  };
}
