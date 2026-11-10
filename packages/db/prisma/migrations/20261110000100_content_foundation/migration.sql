-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'REVIEWED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Jurisdiction" (
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Jurisdiction_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ContentLocale" (
    "id" TEXT NOT NULL,
    "jurisdictionCode" CHAR(2) NOT NULL,
    "language" TEXT NOT NULL,
    "script" TEXT NOT NULL,

    CONSTRAINT "ContentLocale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "localeId" TEXT NOT NULL,
    "licenceCategory" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionRevision" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "correctOption" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewer" TEXT,
    "reviewedOn" DATE,
    "publishedAt" TIMESTAMP(3),
    "sources" JSONB NOT NULL,
    "rights" JSONB NOT NULL,
    "image" JSONB,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "AnswerOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentLocale_jurisdictionCode_language_script_key" ON "ContentLocale"("jurisdictionCode", "language", "script");

-- CreateIndex
CREATE UNIQUE INDEX "Category_localeId_licenceCategory_key_key" ON "Category"("localeId", "licenceCategory", "key");

-- CreateIndex
CREATE INDEX "QuestionRevision_status_categoryId_idx" ON "QuestionRevision"("status", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionRevision_categoryId_key_revision_key" ON "QuestionRevision"("categoryId", "key", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerOption_questionId_key_key" ON "AnswerOption"("questionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerOption_questionId_position_key" ON "AnswerOption"("questionId", "position");

-- AddForeignKey
ALTER TABLE "ContentLocale" ADD CONSTRAINT "ContentLocale_jurisdictionCode_fkey" FOREIGN KEY ("jurisdictionCode") REFERENCES "Jurisdiction"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_localeId_fkey" FOREIGN KEY ("localeId") REFERENCES "ContentLocale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionRevision" ADD CONSTRAINT "QuestionRevision_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerOption" ADD CONSTRAINT "AnswerOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuestionRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
