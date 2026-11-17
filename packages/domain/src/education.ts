import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1);
const date = z.iso.date();
const secureUrl = z.url().refine((url) => new URL(url).protocol === "https:");
export const lessonSchema = z
  .object({
    slug,
    category: slug,
    revision: z.number().int().positive(),
    title: text.min(10).max(100),
    description: text.min(40).max(180),
    summary: text.min(60),
    updatedOn: date,
    sections: z
      .array(
        z
          .object({
            id: slug,
            title: text.min(3),
            paragraphs: z.array(text.min(30)).min(1),
            checklist: z.array(text.min(10)).optional(),
          })
          .strict(),
      )
      .min(2),
    related: z.array(slug).max(4),
    sources: z
      .array(
        z
          .object({
            title: text.min(5),
            url: secureUrl,
            reference: text.min(3),
            accessedOn: date,
          })
          .strict(),
      )
      .min(1),
    rights: z
      .object({
        license: z.literal("PROJECT-ORIGINAL"),
        attribution: text.min(3),
        original: z.literal(true),
      })
      .strict(),
    review: z
      .object({
        status: z.enum(["DRAFT", "REVIEWED", "PUBLISHED"]),
        reviewer: text.min(3).optional(),
        reviewedOn: date.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((lesson, ctx) => {
    if (lesson.review.status !== "DRAFT" && (!lesson.review.reviewer || !lesson.review.reviewedOn))
      ctx.addIssue({ code: "custom", message: "Review evidence is required before publication" });
    if (new Set(lesson.sections.map((section) => section.id)).size !== lesson.sections.length)
      ctx.addIssue({ code: "custom", message: "Section IDs must be unique" });
    if (
      new Set(lesson.related).size !== lesson.related.length ||
      lesson.related.includes(lesson.slug)
    )
      ctx.addIssue({
        code: "custom",
        message: "Related lessons must be distinct and cannot include self",
      });
    if (lesson.review.reviewedOn && lesson.review.reviewedOn < lesson.updatedOn)
      ctx.addIssue({ code: "custom", message: "Review must cover the latest edit" });
    if (lesson.sources.some((source) => source.accessedOn > lesson.updatedOn))
      ctx.addIssue({ code: "custom", message: "Source access must precede the latest edit" });
  });

export const educationBankSchema = z
  .object({
    jurisdiction: z.literal("RS"),
    locale: z.literal("sr-Latn-RS"),
    script: z.literal("Latn"),
    licenceCategory: z.literal("B"),
    categories: z
      .array(
        z
          .object({
            slug,
            title: text.min(3),
            description: text.min(40),
            practiceCategory: slug.optional(),
          })
          .strict(),
      )
      .min(1),
    lessons: z.array(lessonSchema),
  })
  .strict()
  .superRefine((bank, ctx) => {
    const categories = bank.categories.map((category) => category.slug);
    const lessons = bank.lessons.map((lesson) => lesson.slug);
    if (new Set(categories).size !== categories.length || new Set(lessons).size !== lessons.length)
      ctx.addIssue({ code: "custom", message: "Category and lesson slugs must be unique" });
    for (const lesson of bank.lessons) {
      if (
        !categories.includes(lesson.category) ||
        lesson.related.some((slug) => !lessons.includes(slug))
      )
        ctx.addIssue({ code: "custom", message: "Unknown category or related lesson" });
    }
  });
export type EducationBank = z.infer<typeof educationBankSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export function publishedLessons(bank: EducationBank) {
  return bank.lessons.filter((lesson) => lesson.review.status === "PUBLISHED");
}
