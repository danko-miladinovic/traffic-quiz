import { educationBankSchema, publishedLessons } from "@duel/domain/education";
import source from "../../../content/lessons/rs-b.sr-Latn.json";

// Server pages consume only this projection. Draft bodies never enter client props.
export const education = educationBankSchema.parse(source);
export const lessons = publishedLessons(education);
export const categories = education.categories;
export const categoryPath = (slug: string) => `/ucenje/oblasti/${slug}`;
export const lessonPath = (slug: string) => `/ucenje/lekcije/${slug}`;
export function getLesson(slug: string) {
  return lessons.find((lesson) => lesson.slug === slug);
}
