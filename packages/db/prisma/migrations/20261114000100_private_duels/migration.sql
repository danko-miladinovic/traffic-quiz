-- CreateEnum
CREATE TYPE "DuelPhase" AS ENUM ('WAITING', 'READY', 'ROUND', 'ROUND_RESULT', 'FINISHED', 'EXPIRED', 'ABORTED');

-- CreateTable
CREATE TABLE "Duel" (
    "id" UUID NOT NULL,
    "creatorId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryTitle" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "phase" "DuelPhase" NOT NULL DEFAULT 'WAITING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "roundIndex" INTEGER NOT NULL DEFAULT -1,
    "rules" JSONB NOT NULL,
    "inviteHash" CHAR(64),
    "inviteExpiresAt" TIMESTAMP(3) NOT NULL,
    "revealUntil" TIMESTAMP(3),
    "reason" TEXT,
    "nextDuelId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuelPlayer" (
    "id" TEXT NOT NULL,
    "duelId" UUID NOT NULL,
    "guestId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "disconnectedAt" TIMESTAMP(3),
    "rematchReady" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DuelPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuelQuestion" (
    "id" UUID NOT NULL,
    "duelId" UUID NOT NULL,
    "questionRevisionId" TEXT,
    "position" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "opensAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "DuelQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuelAnswer" (
    "questionId" UUID NOT NULL,
    "seat" INTEGER NOT NULL,
    "optionKey" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuelAnswer_pkey" PRIMARY KEY ("questionId","seat")
);

-- CreateIndex
CREATE UNIQUE INDEX "Duel_inviteHash_key" ON "Duel"("inviteHash");

-- CreateIndex
CREATE UNIQUE INDEX "Duel_nextDuelId_key" ON "Duel"("nextDuelId");

-- CreateIndex
CREATE INDEX "Duel_phase_inviteExpiresAt_idx" ON "Duel"("phase", "inviteExpiresAt");

-- CreateIndex
CREATE INDEX "Duel_createdAt_idx" ON "Duel"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Duel_creatorId_requestId_key" ON "Duel"("creatorId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "DuelPlayer_duelId_guestId_key" ON "DuelPlayer"("duelId", "guestId");

-- CreateIndex
CREATE UNIQUE INDEX "DuelPlayer_duelId_seat_key" ON "DuelPlayer"("duelId", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "DuelQuestion_duelId_position_key" ON "DuelQuestion"("duelId", "position");

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_nextDuelId_fkey" FOREIGN KEY ("nextDuelId") REFERENCES "Duel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelPlayer" ADD CONSTRAINT "DuelPlayer_duelId_fkey" FOREIGN KEY ("duelId") REFERENCES "Duel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelPlayer" ADD CONSTRAINT "DuelPlayer_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelQuestion" ADD CONSTRAINT "DuelQuestion_duelId_fkey" FOREIGN KEY ("duelId") REFERENCES "Duel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelQuestion" ADD CONSTRAINT "DuelQuestion_questionRevisionId_fkey" FOREIGN KEY ("questionRevisionId") REFERENCES "QuestionRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuelAnswer" ADD CONSTRAINT "DuelAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DuelQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Duel"
  ADD CONSTRAINT "duel_round_bounds" CHECK ("roundIndex" BETWEEN -1 AND 4),
  ADD CONSTRAINT "duel_version" CHECK ("version" >= 0),
  ADD CONSTRAINT "duel_ended" CHECK (("phase" IN ('FINISHED','EXPIRED','ABORTED')) = ("endedAt" IS NOT NULL)),
  ADD CONSTRAINT "duel_finished_round" CHECK ("phase" <> 'FINISHED' OR "roundIndex" = 4);
ALTER TABLE "DuelPlayer" ADD CONSTRAINT "duel_player_seat" CHECK ("seat" IN (0,1));
ALTER TABLE "DuelQuestion"
  ADD CONSTRAINT "duel_question_position" CHECK ("position" BETWEEN 0 AND 4),
  ADD CONSTRAINT "duel_question_snapshot" CHECK ((
    jsonb_typeof("snapshot") = 'object' AND
    "snapshot"->>'id' = "id"::text AND
    ("snapshot"->>'position')::int = "position" AND
    jsonb_typeof("snapshot"->'options') = 'array' AND
    jsonb_array_length("snapshot"->'options') BETWEEN 2 AND 6 AND
    "snapshot"->'options' @> jsonb_build_array(jsonb_build_object('key', "snapshot"->>'correctOption'))
  ) IS TRUE),
  ADD CONSTRAINT "duel_question_times" CHECK (("opensAt" IS NULL) = ("deadlineAt" IS NULL) AND ("deadlineAt" IS NULL OR "deadlineAt" > "opensAt"));
ALTER TABLE "DuelAnswer"
  ADD CONSTRAINT "duel_answer_seat" CHECK ("seat" IN (0,1)),
  ADD CONSTRAINT "duel_answer_elapsed" CHECK ("elapsedMs" >= 0);

CREATE FUNCTION guard_duel_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."duelId" IS DISTINCT FROM OLD."duelId" OR
     NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."position" IS DISTINCT FROM OLD."position" OR
     NEW."questionRevisionId" IS DISTINCT FROM OLD."questionRevisionId" THEN
    RAISE EXCEPTION 'Duel question snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER duel_snapshot_guard BEFORE UPDATE ON "DuelQuestion"
  FOR EACH ROW EXECUTE FUNCTION guard_duel_snapshot();

CREATE FUNCTION guard_duel_answer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q "DuelQuestion"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Accepted duel answers are immutable'; END IF;
  SELECT * INTO q FROM "DuelQuestion" WHERE "id" = NEW."questionId";
  IF q."closedAt" IS NOT NULL OR q."opensAt" IS NULL OR NEW."receivedAt" < q."opensAt" OR NEW."receivedAt" >= q."deadlineAt" OR
     NOT (q."snapshot"->'options' @> jsonb_build_array(jsonb_build_object('key', NEW."optionKey"))) OR
     NEW."correct" IS DISTINCT FROM (NEW."optionKey" = q."snapshot"->>'correctOption') OR
     NEW."elapsedMs" <> round(extract(epoch from (NEW."receivedAt" - q."opensAt")) * 1000)::int OR
     NOT EXISTS (SELECT 1 FROM "DuelPlayer" WHERE "duelId" = q."duelId" AND "seat" = NEW."seat") THEN
    RAISE EXCEPTION 'Invalid duel answer or timing';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER duel_answer_guard BEFORE INSERT OR UPDATE ON "DuelAnswer"
  FOR EACH ROW EXECUTE FUNCTION guard_duel_answer();
