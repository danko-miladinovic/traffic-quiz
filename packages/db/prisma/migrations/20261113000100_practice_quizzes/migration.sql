-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "categoryId" TEXT,
    "categoryKey" TEXT NOT NULL,
    "categoryTitle" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "nextPosition" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionRevisionId" TEXT,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctOption" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "image" JSONB,

    CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAnswer" (
    "questionId" TEXT NOT NULL,
    "optionKey" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeAnswer_pkey" PRIMARY KEY ("questionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestSession_expiresAt_idx" ON "GuestSession"("expiresAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_guestId_createdAt_idx" ON "PracticeAttempt"("guestId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_createdAt_idx" ON "PracticeAttempt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeAttempt_guestId_requestId_key" ON "PracticeAttempt"("guestId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeQuestion_attemptId_position_key" ON "PracticeQuestion"("attemptId", "position");

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PracticeAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_questionRevisionId_fkey" FOREIGN KEY ("questionRevisionId") REFERENCES "QuestionRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAnswer" ADD CONSTRAINT "PracticeAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cursor bounds and frozen snapshots are authoritative persistence invariants.
ALTER TABLE "PracticeAttempt"
  ADD CONSTRAINT "practice_total" CHECK ("total" BETWEEN 1 AND 5),
  ADD CONSTRAINT "practice_cursor" CHECK ("nextPosition" BETWEEN 0 AND "total"),
  ADD CONSTRAINT "practice_completion" CHECK (("completedAt" IS NOT NULL) = ("nextPosition" = "total"));
ALTER TABLE "PracticeQuestion"
  ADD CONSTRAINT "practice_position" CHECK ("position" >= 0),
  ADD CONSTRAINT "practice_options" CHECK (jsonb_typeof("options") = 'array' AND jsonb_array_length("options") BETWEEN 2 AND 6),
  ADD CONSTRAINT "practice_correct_option" CHECK ("options" @> jsonb_build_array(jsonb_build_object('key', "correctOption")));
CREATE FUNCTION freeze_practice_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Practice snapshots and accepted answers cannot be edited';
END;
$$;
CREATE TRIGGER practice_snapshot_frozen BEFORE UPDATE ON "PracticeQuestion"
  FOR EACH ROW EXECUTE FUNCTION freeze_practice_record();
CREATE TRIGGER practice_answer_frozen BEFORE UPDATE ON "PracticeAnswer"
  FOR EACH ROW EXECUTE FUNCTION freeze_practice_record();
