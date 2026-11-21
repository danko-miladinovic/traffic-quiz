import { configuredAds } from "../../../../lib/ad-server";
import { notFound } from "next/navigation";
import { LessonArticle } from "../../../../components/lesson-article";
import { getLesson, lessons, categories, lessonPath } from "../../../../lib/education";
import { publicMetadata, site } from "../../../../lib/seo";
export const dynamicParams = false;
export function generateStaticParams() {
  return lessons.map((lesson) => ({ slug: lesson.slug }));
}
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const lesson = getLesson((await params).slug);
  if (!lesson) notFound();
  const metadata = publicMetadata(lesson.title, lesson.description, lessonPath(lesson.slug));
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      modifiedTime: lesson.updatedOn,
      section: categories.find((category) => category.slug === lesson.category)!.title,
    },
  };
}
export default async function LessonPage({ params }: Props) {
  const lesson = getLesson((await params).slug);
  if (!lesson) notFound();
  const category = categories.find((category) => category.slug === lesson.category)!;
  return (
    <LessonArticle
      ads={configuredAds()}
      lesson={lesson}
      categoryTitle={category.title}
      related={lessons.filter((item) => lesson.related.includes(item.slug))}
      origin={site.origin}
      practiceCategory={category.practiceCategory}
    />
  );
}
