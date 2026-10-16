import type { MetadataRoute } from "next";

const siteUrl = "https://amfinder.web.id";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /search dan /preset sengaja diblokir: isinya kerangka yang diisi dari
        // browser, nggak ada yang bisa di-crawl, dan /preset id-nya bisa banyak
        // banget kalau dibiarin. Meta noindex tetap dipasang buat yang hiraukan robots.txt.
        disallow: ["/api/", "/search", "/preset"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
