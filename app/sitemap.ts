import type { MetadataRoute } from "next";

const siteUrl = "https://amfinder.web.id";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl}/`, changeFrequency: "monthly", priority: 1 }];
}
