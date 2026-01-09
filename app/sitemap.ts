import type { MetadataRoute } from "next";
import { siteContent } from "@/content/siteContent";
import { getAllPosts } from "@/content/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteContent.seo.siteUrl.replace(/\/$/, "");
  const staticPaths = siteContent.nav.map((n) => n.href).filter(Boolean);

  const posts = getAllPosts().map((p) => `/news/${p.slug}`);

  const urls = [...new Set([...staticPaths, ...posts])];

  return urls.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path.startsWith("/news/") ? "monthly" : "weekly",
    priority: path === "/" ? 1 : 0.8,
  }));
}
