import { createHash } from "node:crypto";
import type { AnalyticsName, AnalyticsSource } from "@duel/domain/analytics";
import { PracticeError } from "@duel/domain/practice";
import type { Database } from "./client";
import type { Prisma } from "../generated/client";
import { transaction } from "./transaction";

export const ANALYTICS_DAYS = 35;
const day = 86_400_000;
export const analyticsHash = (value: string) => createHash("sha256").update(value).digest("hex");
type Tx = Prisma.TransactionClient;
type Input = {
  name: AnalyticsName;
  key: string;
  mode?: "practice" | "duel" | "web";
  resource?: string;
  page?: string;
  demo?: boolean;
  source?: AnalyticsSource;
};

export async function consentVisitor(db: Database, tokenHash: string, now = new Date()) {
  return db.analyticsVisitor.create({
    data: {
      tokenHash,
      createdAt: now,
      lastSeenAt: now,
      consentUntil: new Date(+now + ANALYTICS_DAYS * day),
      expiresAt: new Date(+now + ANALYTICS_DAYS * day),
    },
  });
}
export async function revokeVisitor(db: Database, tokenHash: string) {
  await transaction(db, async (tx) => {
    await tx.analyticsVisitor.deleteMany({ where: { tokenHash } });
  });
}
export async function bindAnalytics(
  db: Database,
  guestHash: string,
  tokenHash?: string,
  now = new Date(),
) {
  return transaction(db, async (tx) => {
    const visitor = tokenHash
      ? await tx.analyticsVisitor.findUnique({ where: { tokenHash } })
      : null;
    await tx.guestSession.updateMany({
      where: { tokenHash: guestHash },
      data: {
        analyticsVisitorId:
          visitor && visitor.consentUntil > now && visitor.expiresAt > now ? visitor.id : null,
      },
    });
  });
}

// Called inside the same serializable transaction as accepted gameplay. No observer delivery gap.
export async function recordAnalytics(
  tx: Tx,
  visitorId: string | null | undefined,
  input: Input,
  now: Date,
) {
  if (!visitorId) return;
  const visitor = await tx.analyticsVisitor.findUnique({ where: { id: visitorId } });
  if (!visitor || visitor.consentUntil <= now || visitor.expiresAt <= now) return;
  const id = analyticsHash(`v1:${visitorId}:${input.name}:${input.key}`);
  if (await tx.analyticsEvent.findUnique({ where: { id } })) return;
  const recent = await tx.analyticsEvent.count({
    where: { visitorId, occurredAt: { gte: new Date(+now - 60_000) } },
  });
  if (recent >= 240) return;
  // Serializes simultaneous page views and game actions for one analytics identity.
  await tx.analyticsVisitor.update({
    where: { id: visitorId },
    data: { lastSeenAt: now, expiresAt: new Date(+now + ANALYTICS_DAYS * day) },
  });
  let visit = await tx.analyticsVisit.findFirst({
    where: { visitorId },
    orderBy: { lastSeenAt: "desc" },
  });
  if (!visit || +now - +visit.lastSeenAt >= 30 * 60_000) {
    visit = await tx.analyticsVisit.create({
      data: {
        visitorId,
        startedAt: now,
        lastSeenAt: now,
        returning: !!visit,
        source: input.source ?? "unknown",
      },
    });
  } else {
    visit = await tx.analyticsVisit.update({ where: { id: visit.id }, data: { lastSeenAt: now } });
  }
  await tx.analyticsEvent.create({
    data: {
      id,
      visitorId,
      visitId: visit.id,
      name: input.name,
      mode: input.mode ?? "web",
      resourceKey: input.resource ? analyticsHash(input.resource) : null,
      page: input.page,
      demo: input.demo ?? false,
      occurredAt: now,
    },
  });
}
export async function recordGuestAnalytics(
  tx: Tx,
  guestId: string,
  input: Input,
  now: Date,
  enabled: boolean,
) {
  if (!enabled) return;
  const guest = await tx.guestSession.findUnique({
    where: { id: guestId },
    select: { analyticsVisitorId: true },
  });
  return recordAnalytics(tx, guest?.analyticsVisitorId, input, now);
}
export async function recordRoomAnalytics(
  tx: Tx,
  guests: string[],
  input: Input,
  now: Date,
  enabled: boolean,
) {
  if (!enabled) return;
  // One observed lifecycle event per room, even when both participants consent.
  const id = analyticsHash(`room:v1:${input.name}:${input.key}`);
  if (await tx.analyticsEvent.findUnique({ where: { id } })) return;
  for (const guestId of guests) {
    const guest = await tx.guestSession.findUnique({
      where: { id: guestId },
      select: { analyticsVisitor: true },
    });
    const visitor = guest?.analyticsVisitor;
    if (visitor && visitor.consentUntil > now && visitor.expiresAt > now) {
      await recordAnalytics(tx, visitor.id, input, now);
      const originalId = analyticsHash(`v1:${visitor.id}:${input.name}:${input.key}`);
      await tx.analyticsEvent.updateMany({ where: { id: originalId }, data: { id } });
      return;
    }
  }
}
export async function browserAnalytics(
  db: Database,
  tokenHash: string,
  input: Input,
  now = new Date(),
) {
  return transaction(db, async (tx) => {
    const visitor = await tx.analyticsVisitor.findUnique({ where: { tokenHash } });
    await recordAnalytics(tx, visitor?.id, input, now);
  });
}
export async function invitationAnalytics(
  db: Database,
  tokenHash: string,
  guestHash: string,
  roomId: string,
  requestId: string,
  now = new Date(),
) {
  return transaction(db, async (tx) => {
    const visitor = await tx.analyticsVisitor.findUnique({ where: { tokenHash } });
    const guest = await tx.guestSession.findUnique({ where: { tokenHash: guestHash } });
    const room = await tx.duel.findUnique({ where: { id: roomId } });
    if (
      !guest ||
      guest.expiresAt <= now ||
      !room ||
      room.creatorId !== guest.id ||
      !["WAITING", "READY"].includes(room.phase)
    )
      throw new PracticeError("NOT_FOUND", "Poziv nije dostupan.", 404);
    await recordAnalytics(
      tx,
      visitor?.id,
      { name: "invite_action", key: requestId, mode: "duel", resource: roomId, demo: room.demo },
      now,
    );
    await recordAnalytics(
      tx,
      visitor?.id,
      { name: "challenge_shared", key: requestId, mode: "duel", resource: roomId, demo: room.demo },
      now,
    );
  });
}

type Row = {
  visitorId: string;
  visitId: string;
  name: string;
  resourceKey: string | null;
  demo: boolean;
  visit: { source: string; returning: boolean };
};
export function summarizeAnalytics(rows: Row[]) {
  const names = Object.fromEntries(
    [
      "page_view",
      "practice_started",
      "question_answered",
      "practice_completed",
      "duel_created",
      "invite_action",
      "player_joined",
      "duel_started",
      "duel_completed",
      "rematch_requested",
      "challenge_shared",
    ].map((name) => [name, rows.filter((row) => row.name === name).length]),
  );
  const active = new Set(rows.map((row) => row.visitorId));
  const visits = new Map(rows.map((row) => [row.visitId, row.visit]));
  const creators = new Set(
    rows.filter((row) => row.name === "duel_created").map((row) => row.visitorId),
  );
  const invited = new Set(
    rows
      .filter((row) => row.name === "invite_action" && creators.has(row.visitorId))
      .map((row) => row.visitorId),
  );
  const starts = new Set(
    rows.filter((row) => row.name === "practice_started").map((row) => row.resourceKey),
  );
  const completed = new Set(
    rows
      .filter((row) => row.name === "practice_completed" && starts.has(row.resourceKey))
      .map((row) => row.resourceKey),
  );
  return {
    events: names,
    activeUsers: active.size,
    visits: visits.size,
    pageViews: names.page_view,
    returningVisitors: new Set(
      rows.filter((row) => row.visit.returning).map((row) => row.visitorId),
    ).size,
    averageAnswersPerVisit: visits.size ? names.question_answered / visits.size : null,
    practiceCompletionRate: starts.size ? completed.size / starts.size : null,
    distinctDuelCreators: creators.size,
    distinctInvitingCreators: invited.size,
    invitationRate: creators.size ? invited.size / creators.size : null,
    successfulJoins: names.player_joined,
    traffic: Object.fromEntries(
      ["direct", "organic", "social", "referral", "unknown"].map((source) => [
        source,
        [...visits.values()].filter((visit) => visit.source === source).length,
      ]),
    ),
  };
}
export async function analyticsReport(db: Database, from: Date, to: Date, includeDemo = false) {
  if (!(from < to) || +to - +from > 32 * day)
    throw new Error("Report range must be 1–32 days, end exclusive");
  const rows = await db.analyticsEvent.findMany({
    where: { occurredAt: { gte: from, lt: to }, ...(includeDemo ? {} : { demo: false }) },
    include: { visit: { select: { source: true, returning: true } } },
    take: 100_001,
  });
  if (rows.length > 100_000)
    throw new Error("Report exceeds MVP event limit; use database aggregation before scaling");
  return summarizeAnalytics(rows);
}
export async function cleanupAnalytics(db: Database, now = new Date()) {
  if (
    !(await db.analyticsEvent.count()) &&
    !(await db.analyticsAggregate.count()) &&
    !(await db.analyticsVisitor.count())
  )
    return { events: 0 };
  // Daily and monthly snapshots contain counts only. Monthly uniques are calculated, never summed from daily uniques.
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cutoff = new Date(+now - ANALYTICS_DAYS * day);
  const periods: { period: string; from: Date; to: Date }[] = [];
  for (let date = +midnight - (ANALYTICS_DAYS - 1) * day; date <= +midnight; date += day)
    periods.push({ period: "day", from: new Date(date), to: new Date(date + day) });
  for (let offset = -1; offset <= 0; offset++) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    if (from >= cutoff)
      periods.push({
        period: "month",
        from,
        to: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)),
      });
  }
  for (const item of periods) {
    const counts = await analyticsReport(db, item.from, item.to);
    await db.analyticsAggregate.upsert({
      where: { period_startsAt: { period: item.period, startsAt: item.from } },
      create: { period: item.period, startsAt: item.from, counts, updatedAt: now },
      update: { counts, updatedAt: now },
    });
  }
  const expiredEvents = await db.analyticsEvent.deleteMany({
    where: { occurredAt: { lt: cutoff } },
  });
  await db.analyticsVisit.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });
  await db.analyticsVisitor.deleteMany({ where: { expiresAt: { lte: now } } });
  await db.analyticsAggregate.deleteMany({
    where: {
      startsAt: { lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1)) },
    },
  });
  return { events: expiredEvents.count };
}
