import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { Server } from "socket.io";
import type { z } from "zod";
import type { Database } from "@duel/db";
import { acquireDuelLease, DuelStore } from "@duel/db/duel";
import { PracticeError } from "@duel/domain/practice";
import {
  duelAnswerSchema,
  duelCreateSchema,
  DuelError,
  duelJoinSchema,
  duelReadySchema,
  duelRoomSchema,
  duelView,
  type DuelAction,
  type DuelGame,
  type DuelReply,
  type DuelRules,
} from "@duel/domain/duel";
import { DuelEngine } from "./engine";

export async function createDuelService(
  db: Database,
  settings: {
    connectionString: string;
    webOrigin: string;
    rules: DuelRules;
    allowDemo: boolean;
    now?: () => number;
  },
) {
  const wall = Date.now();
  const mono = performance.now();
  const now = settings.now ?? (() => Math.floor(wall + performance.now() - mono));
  let ready = false;
  let closing = false;
  let leaseLost = false;
  let release: (() => Promise<void>) | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  const store = new DuelStore(db);
  const http = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(ready && !engine.failed ? 200 : 503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(
        JSON.stringify({
          status: ready && !engine.failed ? "ok" : "unavailable",
          service: "realtime",
          activeRooms: [...engine.rooms.values()].filter(
            (game) => !["FINISHED", "ABORTED", "EXPIRED"].includes(game.phase),
          ).length,
        }),
      );
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  const io = new Server(http, {
    cors: { origin: settings.webOrigin, methods: ["GET", "POST"], credentials: true },
    allowRequest: (request, callback) =>
      callback(
        null,
        request.headers.origin === settings.webOrigin ||
          (!request.headers.origin && request.headers["sec-fetch-site"] === "same-origin"),
      ),
    maxHttpBufferSize: 16_384,
    serveClient: false,
    pingInterval: 5000,
    pingTimeout: 5000,
  });
  const channel = (roomId: string, guestId: string) => `duel:${roomId}:${guestId}`;
  const engine = new DuelEngine(store, {
    now,
    rules: settings.rules,
    allowDemo: settings.allowDemo,
    onState: (game) => {
      for (const player of game.players)
        io.to(channel(game.id, player.guestId)).emit(
          "duel:state",
          duelView(game, player.guestId, now()),
        );
    },
    onFailure: () => {
      ready = false;
      io.emit(
        "duel:unavailable",
        "Servis je privremeno nedostupan. Duel neće dobiti netačan rezultat.",
      );
    },
  });
  const buckets = new Map<string, { count: number; until: number }>();
  function limit(key: string, maximum: number) {
    const time = now();
    for (const [id, bucket] of buckets) if (bucket.until <= time) buckets.delete(id);
    if (buckets.size >= 10_000 && !buckets.has(key))
      throw new DuelError("RATE_LIMIT", "Sačekaj minut i pokušaj ponovo.", 429);
    const bucket = buckets.get(key) ?? { count: 0, until: time + 60_000 };
    bucket.count++;
    buckets.set(key, bucket);
    if (bucket.count > maximum)
      throw new DuelError("RATE_LIMIT", "Previše zahteva. Sačekaj minut.", 429);
  }
  io.use(async (socket, next) => {
    try {
      if (!ready || engine.failed) throw new Error("unavailable");
      limit("connections", 600);
      const token = socket.request.headers.cookie?.match(
        /(?:^|;\s*)duel_guest=([a-f0-9]{64})(?:;|$)/,
      )?.[1];
      if (!token) throw new Error("unauthorized");
      const guestId = await store.authenticate(
        createHash("sha256").update(token).digest("hex"),
        now(),
      );
      limit(`connect:${guestId}`, 30);
      if (
        [...io.sockets.sockets.values()].filter((item) => item.data.guestId === guestId).length >= 3
      )
        throw new Error("capacity");
      socket.data.guestId = guestId;
      next();
    } catch {
      next(new Error("Sesija ili servis nisu dostupni. Osveži stranicu i pokušaj ponovo."));
    }
  });
  io.on("connection", (socket) => {
    const guestId = socket.data.guestId as string;
    let actions = Promise.resolve();
    function action<T>(
      event: DuelAction,
      schema: z.ZodType<T>,
      work: (payload: T, receivedAt: number) => Promise<DuelGame>,
      attach = false,
    ) {
      socket.on(event, (payload: unknown, acknowledge: unknown) => {
        const receivedAt = now();
        if (typeof acknowledge !== "function") return;
        const ack = acknowledge as (reply: DuelReply) => void;
        const reject = (error: unknown) =>
          ack({
            ok: false,
            error:
              error instanceof PracticeError
                ? { code: error.code, message: error.message }
                : { code: "UNAVAILABLE", message: "Duel trenutno nije dostupan. Pokušaj ponovo." },
          });
        try {
          if (!ready || engine.failed)
            throw new DuelError("UNAVAILABLE", "Servis za duele nije dostupan.", 503);
          limit("events", 6000);
          limit(`events:${guestId}`, 120);
          const parsed = schema.safeParse(payload);
          if (!parsed.success) throw new DuelError("INVALID_INPUT", "Zahtev nije ispravan.", 400);
          actions = actions
            .then(async () => {
              try {
                let game = await work(parsed.data, receivedAt);
                if (attach && socket.connected) {
                  game = await engine.connect(game.id, guestId, socket.id);
                  for (const room of socket.rooms)
                    if (room.startsWith("duel:")) await socket.leave(room);
                  await socket.join(channel(game.id, guestId));
                }
                if (event === "duel:leave") {
                  await engine.disconnect(socket.id);
                  for (const room of socket.rooms)
                    if (room.startsWith("duel:")) await socket.leave(room);
                  game = await engine.watch(game.id, guestId);
                }
                ack({ ok: true, state: duelView(game, guestId, now()) });
              } catch (error) {
                reject(error);
              }
            })
            .catch(() => {});
        } catch (error) {
          reject(error);
        }
      });
    }
    action(
      "duel:create",
      duelCreateSchema,
      (payload) => engine.create(guestId, payload.categoryKey, payload.requestId),
      true,
    );
    action("duel:join", duelJoinSchema, (payload) => engine.join(guestId, payload.token), true);
    action("duel:watch", duelRoomSchema, (payload) => engine.watch(payload.roomId, guestId), true);
    action("duel:ready", duelReadySchema, (payload) =>
      engine.ready(payload.roomId, guestId, payload.ready),
    );
    action("duel:answer", duelAnswerSchema, (payload, receivedAt) =>
      engine.answer(payload.roomId, guestId, payload.round, payload.optionKey, receivedAt),
    );
    action("duel:rematch", duelRoomSchema, (payload) => engine.rematch(payload.roomId, guestId));
    action("duel:leave", duelRoomSchema, (payload) => engine.leave(payload.roomId, guestId));
    socket.on("disconnect", () => {
      void engine.disconnect(socket.id).catch(() => {});
    });
  });
  try {
    release = await acquireDuelLease(settings.connectionString, () => {
      leaseLost = true;
      ready = false;
      void close(false);
    });
  } catch (error) {
    io.close();
    throw error;
  }
  try {
    await store.abortInterrupted("SERVER_RESTART", now());
  } catch (error) {
    await release();
    io.close();
    throw error;
  }
  ready = true;
  interval = setInterval(() => {
    void engine.tick().catch(() => {});
  }, 100);
  interval.unref();
  async function close(persist = true) {
    if (closing) return;
    closing = true;
    ready = false;
    if (interval) clearInterval(interval);
    try {
      await engine.stop(persist && !leaseLost && !!release);
    } finally {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (release) await release().catch(() => {});
    }
  }
  return {
    io,
    engine,
    http,
    close,
    async listen(port: number, host = "127.0.0.1") {
      await new Promise<void>((resolve, reject) => {
        http.once("error", reject);
        http.listen(port, host, () => {
          http.off("error", reject);
          resolve();
        });
      });
      const address = http.address();
      if (!address || typeof address === "string") throw new Error("No server address");
      return address.port;
    },
  };
}
