import { assertRevisionTransition, questionSchema, type ContentBank } from "@duel/domain";
import { Prisma } from "../generated/client";
import type { Database } from "./client";

export async function importContent(db: Database, bank: ContentBank, publish = false) {
  if (!publish && bank.questions.some((question) => question.review.status === "PUBLISHED")) {
    throw new Error("Publishing requires --publish after editorial review");
  }
  return db.$transaction(
    async (tx) => {
      await tx.jurisdiction.upsert({
        where: { code: bank.jurisdiction },
        create: { code: bank.jurisdiction, name: "Srbija" },
        update: {},
      });
      await tx.contentLocale.upsert({
        where: { id: bank.locale },
        create: {
          id: bank.locale,
          jurisdictionCode: bank.jurisdiction,
          language: bank.language,
          script: bank.script,
        },
        update: {},
      });
      const categoryIds = new Map<string, string>();
      for (const category of bank.categories) {
        const row = await tx.category.upsert({
          where: {
            localeId_licenceCategory_key: {
              localeId: bank.locale,
              licenceCategory: bank.licenceCategory,
              key: category.key,
            },
          },
          create: { ...category, localeId: bank.locale, licenceCategory: bank.licenceCategory },
          update: { title: category.title, description: category.description },
        });
        categoryIds.set(category.key, row.id);
      }
      for (const question of bank.questions) {
        const categoryId = categoryIds.get(question.category)!;
        const where = {
          categoryId_key_revision: { categoryId, key: question.key, revision: question.revision },
        };
        const existing = await tx.questionRevision.findUnique({ where });
        if (existing) {
          assertRevisionTransition(questionSchema.parse(existing.content), question);
          if (existing.status === "PUBLISHED") continue;
        }
        const data = {
          categoryId,
          key: question.key,
          revision: question.revision,
          prompt: question.prompt,
          explanation: question.explanation,
          correctOption: question.correctOption,
          // Write options while editable, then publish atomically below.
          status:
            question.review.status === "PUBLISHED" ? ("REVIEWED" as const) : question.review.status,
          reviewer: question.review.reviewer ?? null,
          reviewedOn: question.review.reviewedOn ? new Date(question.review.reviewedOn) : null,
          publishedAt: null,
          sources: question.sources,
          rights: question.rights,
          image: question.image ?? Prisma.DbNull,
          content: question,
        };
        const options = question.options.map((option, position) => ({ ...option, position }));
        if (existing) {
          await tx.answerOption.deleteMany({ where: { questionId: existing.id } });
          await tx.questionRevision.update({
            where,
            data: { ...data, options: { create: options } },
          });
        } else {
          await tx.questionRevision.create({ data: { ...data, options: { create: options } } });
        }
        if (question.review.status === "PUBLISHED") {
          await tx.questionRevision.update({
            where,
            data: { status: "PUBLISHED", publishedAt: new Date() },
          });
        }
      }
    },
    { isolationLevel: "Serializable", timeout: 15_000 },
  );
}

// Public projections intentionally omit keys, explanations and editorial metadata.
export async function getPublishedQuestions(
  db: Database,
  localeId: string,
  licenceCategory: string,
  categoryKey: string,
) {
  const rows = await db.questionRevision.findMany({
    where: { status: "PUBLISHED", category: { localeId, licenceCategory, key: categoryKey } },
    orderBy: [{ key: "asc" }, { revision: "desc" }],
    select: {
      id: true,
      key: true,
      revision: true,
      prompt: true,
      options: { orderBy: { position: "asc" }, select: { key: true, text: true } },
    },
  });
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    })
    .map(({ key: _key, revision: _revision, ...question }) => question);
}
