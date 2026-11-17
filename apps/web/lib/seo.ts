import type { Metadata, MetadataRoute } from "next";
import type { EducationBank, Lesson } from "@duel/domain/education";
import { publishedLessons } from "@duel/domain/education";

export function seoSettings(env: Record<string, string | undefined>) {
  const enabled = env.SEARCH_INDEXING_ENABLED === "true";
  if (env.SEARCH_INDEXING_ENABLED && !["true", "false"].includes(env.SEARCH_INDEXING_ENABLED))
    throw new Error("SEARCH_INDEXING_ENABLED must be true or false");
  let origin: string | undefined;
  if (env.SITE_URL) {
    const url = new URL(env.SITE_URL);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error("SITE_URL must be an origin without credentials, query or path");
    if (
      enabled &&
      (url.protocol !== "https:" ||
        !url.hostname.includes(".") ||
        /(^|\.)(localhost|test|invalid|example)$/.test(url.hostname) ||
        /^[\d.]+$/.test(url.hostname))
    )
      throw new Error("Search indexing needs a public HTTPS SITE_URL");
    origin = url.origin;
  }
  if (enabled && !origin) throw new Error("Search indexing needs SITE_URL");
  return { enabled, origin };
}
export const site = seoSettings(process.env);
export const privateRobots = { index: false, follow: false };
export function publicMetadata(
  title: string,
  description: string,
  path: string,
  eligible = true,
): Metadata {
  return {
    title,
    description,
    alternates: site.origin ? { canonical: site.origin + path } : undefined,
    robots: { index: site.enabled && eligible, follow: site.enabled && eligible },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "sr_RS",
      siteName: "Saobraćajni Duel",
      url: site.origin ? site.origin + path : undefined,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Saobraćajni Duel — učenje, vežbanje i prijateljski dueli",
        },
      ],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  };
}
export function publicSitemap(bank: EducationBank, settings = site): MetadataRoute.Sitemap {
  const published = publishedLessons(bank);
  if (!settings.enabled || !settings.origin || !published.length) return [];
  const base = settings.origin;
  return [
    { url: base + "/" },
    { url: base + "/ucenje" },
    ...bank.categories
      .filter((category) => published.some((lesson) => lesson.category === category.slug))
      .map((category) => ({ url: `${base}/ucenje/oblasti/${category.slug}` })),
    ...published.map((lesson) => ({
      url: `${base}/ucenje/lekcije/${lesson.slug}`,
      lastModified: lesson.updatedOn,
    })),
  ];
}
export function robotsPolicy(hasPublished: boolean, settings = site): MetadataRoute.Robots {
  if (!settings.enabled || !settings.origin || !hasPublished)
    return { rules: { userAgent: "*", disallow: "/" } };
  // Allow crawlers to see the noindex directive on /duel and /vezbanje.
  // Secrets live in fragments/cookies; these directives do not provide authorization.
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/socket.io/"] },
    sitemap: settings.origin + "/sitemap.xml",
  };
}
export function lessonStructuredData(lesson: Lesson, categoryTitle: string, origin: string) {
  const url = `${origin}/ucenje/lekcije/${lesson.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: lesson.title,
        description: lesson.description,
        inLanguage: "sr-Latn-RS",
        dateModified: lesson.updatedOn,
        url,
        mainEntityOfPage: url,
        articleSection: categoryTitle,
        citation: lesson.sources.map((source) => source.url),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Učenje", item: origin + "/ucenje" },
          {
            "@type": "ListItem",
            position: 2,
            name: categoryTitle,
            item: `${origin}/ucenje/oblasti/${lesson.category}`,
          },
          { "@type": "ListItem", position: 3, name: lesson.title, item: url },
        ],
      },
    ],
  };
}
export const jsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
