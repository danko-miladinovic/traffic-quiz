import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const date = z.iso.date();
const source = z.object({
  title: z.string().min(5),
  url: z.url().refine((value) => value.startsWith("https://")),
  reference: z.string().min(3),
  accessedOn: date,
});
const rights = z.object({
  license: z.enum(["PROJECT-ORIGINAL", "CC-BY-4.0", "CC0-1.0"]),
  attribution: z.string().min(3),
  original: z.literal(true),
});
const review = z.object({
  status: z.enum(["DRAFT", "REVIEWED", "PUBLISHED"]),
  reviewer: z.string().min(3).optional(),
  reviewedOn: date.optional(),
});

export const questionSchema = z
  .object({
    key: slug,
    revision: z.number().int().positive(),
    category: slug,
    prompt: z.string().min(15),
    explanation: z.string().min(30),
    options: z
      .array(z.object({ key: slug, text: z.string().min(1) }))
      .min(2)
      .max(6),
    correctOption: slug,
    sources: z.array(source).min(1),
    rights,
    review,
    image: z
      .object({
        path: z.string().regex(/^\/illustrations\/[a-z0-9-]+\.svg$/),
        alt: z.string().min(10),
        rights,
      })
      .optional(),
  })
  .superRefine((question, ctx) => {
    const keys = question.options.map((option) => option.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", message: "Option keys must be unique" });
    }
    if (!keys.includes(question.correctOption)) {
      ctx.addIssue({ code: "custom", message: "Correct option must exist" });
    }
    if (
      question.review.status !== "DRAFT" &&
      (!question.review.reviewer || !question.review.reviewedOn)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Reviewed/published content needs reviewer and review date",
      });
    }
  });

export const contentBankSchema = z
  .object({
    jurisdiction: z.literal("RS"),
    locale: z.literal("sr-Latn-RS"),
    language: z.literal("sr"),
    script: z.literal("Latn"),
    licenceCategory: z.literal("B"),
    categories: z
      .array(z.object({ key: slug, title: z.string().min(3), description: z.string().min(15) }))
      .min(1),
    questions: z.array(questionSchema).min(1),
  })
  .superRefine((bank, ctx) => {
    const categories = bank.categories.map((category) => category.key);
    if (new Set(categories).size !== categories.length) {
      ctx.addIssue({ code: "custom", message: "Category keys must be unique" });
    }
    const revisions = bank.questions.map((question) => `${question.key}:${question.revision}`);
    if (new Set(revisions).size !== revisions.length) {
      ctx.addIssue({ code: "custom", message: "Question revisions must be unique" });
    }
    for (const question of bank.questions) {
      if (!categories.includes(question.category)) {
        ctx.addIssue({ code: "custom", message: `Unknown category: ${question.category}` });
      }
    }
  });

export type ContentBank = z.infer<typeof contentBankSchema>;
export type Question = z.infer<typeof questionSchema>;

// A transition to PUBLISHED requires a separate, explicit import flag.
export function assertRevisionTransition(existing: Question, incoming: Question) {
  if (existing.review.status === "PUBLISHED") {
    if (JSON.stringify(existing) !== JSON.stringify(incoming)) {
      throw new Error("Published revisions are immutable; create a new revision");
    }
  } else if (existing.review.status === "REVIEWED" && incoming.review.status === "DRAFT") {
    throw new Error("A reviewed revision cannot return to draft; create a new revision");
  }
}
