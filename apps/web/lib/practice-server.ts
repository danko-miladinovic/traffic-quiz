import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createDatabase, type Database } from "@duel/db";
import { cleanupPractice, openGuestSession } from "@duel/db/practice";
import { PracticeError } from "@duel/domain/practice";
import { realtimeEnv } from "@duel/domain/env";

const globalState = globalThis as typeof globalThis & {
  practiceDb?: Database;
  practiceCleanup?: ReturnType<typeof setInterval>;
  practiceLimiter?: { salt: Buffer; buckets: Map<string, { count: number; expires: number }> };
};
export function database() {
  const db = (globalState.practiceDb ??= createDatabase());
  if (!globalState.practiceCleanup) {
    const clean = () => {
      void cleanupPractice(db).catch(() => console.error("Practice retention cleanup unavailable"));
    };
    globalState.practiceCleanup = setInterval(clean, 3_600_000);
    globalState.practiceCleanup.unref();
    clean();
  }
  return db;
}
export const demoEnabled = () =>
  process.env.NODE_ENV !== "production" && process.env.PRACTICE_DEMO === "true";
const cookieName = "duel_guest";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const tokenValid = (token: string | undefined): token is string =>
  !!token && /^[a-f0-9]{64}$/.test(token);

export async function guestHash() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!tokenValid(token))
    throw new PracticeError("SESSION_EXPIRED", "Sesija je istekla. Pokreni novo vežbanje.", 401);
  return hash(token);
}

export async function establishSession() {
  let token = (await cookies()).get(cookieName)?.value;
  if (tokenValid(token)) {
    try {
      await openGuestSession(database(), hash(token));
    } catch (error) {
      if (!(error instanceof PracticeError) || error.code !== "SESSION_EXPIRED") throw error;
      token = undefined;
    }
  }
  if (!tokenValid(token)) {
    token = randomBytes(32).toString("hex");
    await openGuestSession(database(), hash(token));
  }
  const response = json({ ok: true });
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86_400,
  });
  return response;
}

// Coarse single-process abuse guard; database-backed per-guest start limits add durability.
// Forwarded headers are deliberately ignored until a trusted proxy is configured.
export function rateLimit(request: Request, scope: string, limit = 120) {
  const limiter = (globalState.practiceLimiter ??= { salt: randomBytes(32), buckets: new Map() });
  const now = Date.now();
  for (const [key, value] of limiter.buckets) if (value.expires <= now) limiter.buckets.delete(key);
  const globalKey = `global:${scope}`;
  const globalBucket = limiter.buckets.get(globalKey) ?? { count: 0, expires: now + 60_000 };
  globalBucket.count++;
  limiter.buckets.set(globalKey, globalBucket);
  if (globalBucket.count > (scope === "session" ? 120 : 1200))
    throw new PracticeError("RATE_LIMIT", "Sačekaj minut i pokušaj ponovo.", 429);
  // Anonymous requests share a bounded global bucket; no IP addresses are collected.
  const cookie = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)duel_guest=([a-f0-9]{64})(?:;|$)/)?.[1];
  const key = `${scope}:${createHmac("sha256", limiter.salt)
    .update(cookie ?? "anonymous")
    .digest("hex")}`;
  const bucket = limiter.buckets.get(key) ?? { count: 0, expires: now + 60_000 };
  if (limiter.buckets.size >= 10_000 && !limiter.buckets.has(key))
    throw new PracticeError("RATE_LIMIT", "Sačekaj minut i pokušaj ponovo.", 429);
  bucket.count++;
  limiter.buckets.set(key, bucket);
  if (bucket.count > limit)
    throw new PracticeError("RATE_LIMIT", "Sačekaj minut i pokušaj ponovo.", 429);
}

export function requireOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.WEB_ORIGIN;
  if (process.env.NODE_ENV === "production" && !configured)
    throw new Error("WEB_ORIGIN is required in production");
  const expected = configured
    ? realtimeEnv.parse({ WEB_ORIGIN: configured }).WEB_ORIGIN
    : new URL(request.url).origin;
  if (origin !== expected || request.headers.get("sec-fetch-site") === "cross-site")
    throw new PracticeError("ORIGIN_REJECTED", "Zahtev mora doći sa ove stranice.", 403);
}

export async function body(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    throw new PracticeError("INVALID_INPUT", "Očekivan je JSON zahtev.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new PracticeError("INVALID_INPUT", "Nedostaju podaci zahteva.", 400);
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        throw new PracticeError("INVALID_INPUT", "Zahtev je prevelik.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PracticeError("INVALID_INPUT", "Zahtev nije ispravan.", 400);
  }
}

export function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      Vary: "Cookie, Origin",
    },
  });
}
export async function handle(
  request: Request,
  work: () => Promise<Response>,
  write = false,
  scope = "practice",
) {
  try {
    if (write) requireOrigin(request);
    rateLimit(request, scope, scope === "session" ? 30 : 120);
    return await work();
  } catch (error) {
    if (error instanceof PracticeError) {
      const response = json({ error: { code: error.code, message: error.message } }, error.status);
      if (error.status === 429) response.headers.set("Retry-After", "60");
      return response;
    }
    // Do not expose database URLs, submitted content, credentials or stack traces.
    console.error("Practice service unavailable");
    return json(
      {
        error: {
          code: "UNAVAILABLE",
          message: "Vežbanje trenutno nije dostupno. Pokušaj ponovo za trenutak.",
        },
      },
      503,
    );
  }
}

export async function attemptId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-z0-9]{10,50}$/.test(id))
    throw new PracticeError("NOT_FOUND", "Vežbanje nije pronađeno.", 404);
  return id;
}
