CREATE TABLE "AnalyticsVisitor" (
 "id" UUID NOT NULL PRIMARY KEY, "tokenHash" CHAR(64) NOT NULL UNIQUE,
 "consentUntil" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AnalyticsVisitor_expiresAt_idx" ON "AnalyticsVisitor"("expiresAt");
ALTER TABLE "GuestSession" ADD COLUMN "analyticsVisitorId" UUID;
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_analyticsVisitorId_fkey" FOREIGN KEY ("analyticsVisitorId") REFERENCES "AnalyticsVisitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "AnalyticsVisit" (
 "id" UUID NOT NULL PRIMARY KEY, "visitorId" UUID NOT NULL REFERENCES "AnalyticsVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "startedAt" TIMESTAMP(3) NOT NULL, "lastSeenAt" TIMESTAMP(3) NOT NULL, "source" VARCHAR(10) NOT NULL,
 "returning" BOOLEAN NOT NULL,
 CONSTRAINT "AnalyticsVisit_source_check" CHECK ("source" IN ('direct','organic','social','referral','unknown'))
);
CREATE INDEX "AnalyticsVisit_visitorId_lastSeenAt_idx" ON "AnalyticsVisit"("visitorId", "lastSeenAt");
CREATE INDEX "AnalyticsVisit_startedAt_idx" ON "AnalyticsVisit"("startedAt");
CREATE TABLE "AnalyticsEvent" (
 "id" CHAR(64) NOT NULL PRIMARY KEY, "visitorId" UUID NOT NULL REFERENCES "AnalyticsVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "visitId" UUID NOT NULL REFERENCES "AnalyticsVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "name" VARCHAR(24) NOT NULL, "mode" VARCHAR(8) NOT NULL, "resourceKey" CHAR(64), "page" VARCHAR(160), "demo" BOOLEAN NOT NULL DEFAULT false,
 "occurredAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "AnalyticsEvent_name_check" CHECK ("name" IN ('page_view','practice_started','question_answered','practice_completed','duel_created','invite_action','player_joined','duel_started','duel_completed','rematch_requested','challenge_shared')),
 CONSTRAINT "AnalyticsEvent_mode_check" CHECK ("mode" IN ('web','practice','duel')),
 CONSTRAINT "AnalyticsEvent_page_check" CHECK ("page" IS NULL OR "page" ~ '^/[a-z0-9/-]*$')
);
CREATE INDEX "AnalyticsEvent_occurredAt_idx" ON "AnalyticsEvent"("occurredAt");
CREATE INDEX "AnalyticsEvent_visitorId_occurredAt_idx" ON "AnalyticsEvent"("visitorId", "occurredAt");
CREATE TABLE "AnalyticsAggregate" (
 "period" VARCHAR(5) NOT NULL, "startsAt" DATE NOT NULL, "counts" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("period", "startsAt"), CONSTRAINT "AnalyticsAggregate_period_check" CHECK ("period" IN ('day','month'))
);
