import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://villageclaq.com";

  const publicPages = [
    "",
    "/about",
    "/contact",
    "/terms",
    "/privacy",
  ];

  const locales = ["en", "fr"];

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const page of publicPages) {
      entries.push({
        url: `${baseUrl}/${locale}${page}`,
        lastModified: new Date(),
        changeFrequency: page === "" ? "weekly" : "monthly",
        priority: page === "" ? 1.0 : 0.7,
      });
    }
  }

  return entries;
}
