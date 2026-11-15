import { DuelStore } from "@duel/db/duel";
import { PracticeError } from "@duel/domain/practice";
import {
  answerDuel,
  defaultDuelRules,
  DuelError,
  duelPlayer,
  endDuel,
  readyDuel,
  terminalDuel,
  tickDuel,
  type DuelGame,
  type DuelRules,
} from "@duel/domain/duel";

export class DuelEngine {
  readonly rooms = new Map<string, DuelGame>();
  readonly bindings = new Map<string, { roomId: string; guestId: string }>();
  private queues = new Map<string, Promise<unknown>>();
  private ticking = new Set<string>();
  accepting = true;
  failed = false;
  constructor(
    readonly store: DuelStore,
    readonly options: {
      now: () => number;
      rules?: DuelRules;
      allowDemo?: boolean;
      onState: (game: DuelGame) => void;
      onFailure?: () => void;
    },
  ) {}
  private async queue<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (!this.accepting || this.failed)
      throw new DuelError("UNAVAILABLE", "Servis za duele trenutno nije dostupan.", 503);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => {
        if (!this.accepting || this.failed)
          throw new DuelError("UNAVAILABLE", "Servis za duele trenutno nije dostupan.", 503);
        return work();
      });
    this.queues.set(key, next);
    try {
      return await next;
    } catch (error) {
      if (!(error instanceof PracticeError) || error.code === "STATE_CONFLICT") {
        this.failed = true;
        this.options.onFailure?.();
        throw new DuelError(
          "UNAVAILABLE",
          "Veza sa servisom je prekinuta. Duel neće dobiti netačan rezultat.",
          503,
        );
      }
      throw error;
    } finally {
      if (this.queues.get(key) === next) this.queues.delete(key);
    }
  }
  private async game(id: string) {
    const cached = this.rooms.get(id);
    if (cached) return cached;
    const game = await this.store.load(id);
    if (!game || (game.demo && !this.options.allowDemo))
      throw new DuelError("NOT_FOUND", "Duel nije pronađen.", 404);
    if (!terminalDuel(game))
      throw new DuelError("STATE_CONFLICT", "Duel je prekinut. Pokreni novi izazov.", 503);
    if (this.rooms.size >= 500)
      throw new DuelError("CAPACITY", "Servis je zauzet. Pokušaj uskoro.", 503);
    this.rooms.set(id, game);
    return game;
  }
  private async commit(next: DuelGame, old: DuelGame) {
    if (JSON.stringify(next) === JSON.stringify(old)) return old;
    next.version = old.version + 1;
    await this.store.save(next, old);
    this.rooms.set(next.id, next);
    this.options.onState(next);
    return next;
  }
  private command(id: string, change: (game: DuelGame) => void) {
    return this.queue(id, async () => {
      const old = await this.game(id);
      const next = structuredClone(old);
      change(next);
      return this.commit(next, old);
    });
  }
  async create(guestId: string, categoryKey: string, requestId: string) {
    return this.queue("creation", async () => {
      const previous = await this.store.findRequest(guestId, requestId);
      if (previous) {
        if (previous.categoryKey !== categoryKey)
          throw new DuelError(
            "REQUEST_CONFLICT",
            "Ovaj zahtev je već iskorišćen za drugi izazov.",
            409,
          );
        const game = await this.game(previous.id);
        duelPlayer(game, guestId);
        return game;
      }
      if (this.rooms.size >= 500)
        throw new DuelError("CAPACITY", "Servis je zauzet. Pokušaj uskoro.", 503);
      const game = await this.store.create(
        guestId,
        categoryKey,
        requestId,
        this.options.rules ?? defaultDuelRules,
        this.options.now(),
        !!this.options.allowDemo,
      );
      this.rooms.set(game.id, game);
      return game;
    });
  }
  async join(guestId: string, token: string) {
    const found = await this.store.findInvitation(token);
    if (!found)
      throw new DuelError("INVITE_INVALID", "Poziv je istekao ili više nije dostupan.", 404);
    return this.command(found.id, (game) => {
      const now = this.options.now();
      if (game.demo && !this.options.allowDemo)
        throw new DuelError("INVITE_INVALID", "Poziv nije dostupan.", 404);
      if (now >= game.inviteExpiresAt)
        throw new DuelError("INVITE_EXPIRED", "Poziv je istekao. Zatraži novi link.", 410);
      if (game.players.some((player) => player.guestId === guestId)) return;
      if (game.players.length >= 2)
        throw new DuelError("ROOM_FULL", "Ovaj duel već ima dva igrača.", 409);
      if (game.phase !== "WAITING")
        throw new DuelError("INVITE_INVALID", "Ovaj poziv više nije aktivan.", 409);
      game.players.push({
        guestId,
        seat: 1,
        ready: false,
        connected: false,
        disconnectedAt: now,
        rematchReady: false,
      });
      game.phase = "READY";
    });
  }
  private connected(roomId: string, guestId: string) {
    return [...this.bindings.values()].some(
      (binding) => binding.roomId === roomId && binding.guestId === guestId,
    );
  }
  async connect(roomId: string, guestId: string, connectionId: string) {
    const binding = this.bindings.get(connectionId);
    if (binding && binding.roomId !== roomId) await this.disconnect(connectionId);
    return this.command(roomId, (game) => {
      const player = duelPlayer(game, guestId);
      tickDuel(game, this.options.now());
      this.bindings.set(connectionId, { roomId, guestId });
      player.connected = true;
      player.disconnectedAt = null;
    });
  }
  async disconnect(connectionId: string) {
    const binding = this.bindings.get(connectionId);
    if (!binding) return;
    this.bindings.delete(connectionId);
    if (!this.accepting || this.failed) return;
    return this.command(binding.roomId, (game) => {
      if (this.connected(binding.roomId, binding.guestId)) return;
      const player = duelPlayer(game, binding.guestId);
      player.connected = false;
      player.disconnectedAt = this.options.now();
      if (game.phase === "READY" || game.phase === "WAITING") player.ready = false;
      tickDuel(game, this.options.now());
    });
  }
  ready(roomId: string, guestId: string, ready: boolean) {
    return this.command(roomId, (game) => {
      tickDuel(game, this.options.now());
      readyDuel(game, guestId, ready, this.options.now());
    });
  }
  watch(roomId: string, guestId: string) {
    return this.command(roomId, (game) => {
      duelPlayer(game, guestId);
      tickDuel(game, this.options.now());
    });
  }
  answer(roomId: string, guestId: string, round: number, optionKey: string, receivedAt: number) {
    return this.command(roomId, (game) => {
      answerDuel(game, guestId, round, optionKey, receivedAt);
    });
  }
  async leave(roomId: string, guestId: string) {
    const left = await this.command(roomId, (game) => {
      duelPlayer(game, guestId).rematchReady = false;
      endDuel(game, "ABORTED", "PLAYER_LEFT", this.options.now());
    });
    if (left.nextDuelId)
      await this.command(left.nextDuelId, (game) => {
        duelPlayer(game, guestId);
        endDuel(game, "ABORTED", "PLAYER_LEFT", this.options.now());
      });
    return left;
  }
  rematch(roomId: string, guestId: string) {
    return this.queue(roomId, async () => {
      const old = await this.game(roomId);
      duelPlayer(old, guestId);
      if (old.phase !== "FINISHED")
        throw new DuelError("NOT_FINISHED", "Revanš je moguć posle završenog duela.", 409);
      if (old.nextDuelId) return old;
      const next = structuredClone(old);
      duelPlayer(next, guestId).rematchReady = true;
      let current = await this.commit(next, old);
      if (
        current.players.length === 2 &&
        current.players.every((player) => player.rematchReady && player.connected)
      ) {
        const child = await this.store.create(
          current.creatorId,
          current.categoryKey,
          current.id,
          current.rules,
          this.options.now(),
          !!this.options.allowDemo,
          current.players[1].guestId,
        );
        this.rooms.set(child.id, child);
        const linked = structuredClone(current);
        linked.nextDuelId = child.id;
        current = await this.commit(linked, current);
      }
      return current;
    });
  }
  async tick() {
    if (!this.accepting || this.failed) return;
    await Promise.all(
      [...this.rooms.values()].map(async (game) => {
        if (
          terminalDuel(game) &&
          game.endedAt !== null &&
          this.options.now() - game.endedAt > 300_000 &&
          ![...this.bindings.values()].some((binding) => binding.roomId === game.id)
        ) {
          this.rooms.delete(game.id);
          return;
        }
        if (terminalDuel(game) || this.ticking.has(game.id)) return;
        this.ticking.add(game.id);
        try {
          await this.command(game.id, (next) => tickDuel(next, this.options.now()));
        } finally {
          this.ticking.delete(game.id);
        }
      }),
    );
  }
  async stop(persist = true) {
    this.accepting = false;
    await Promise.allSettled([...this.queues.values()]);
    if (persist) await this.store.abortInterrupted("SERVER_STOP", this.options.now());
    for (const game of this.rooms.values()) {
      if (!terminalDuel(game)) {
        endDuel(game, "ABORTED", "SERVER_STOP", this.options.now());
        game.version++;
        this.options.onState(game);
      }
    }
    this.bindings.clear();
  }
}
