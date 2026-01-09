import type { MetadataRoute } from "next";
import { siteContent } from "@/content/siteContent";

export default function robots(): MetadataRoute.Robots {
  const base = siteContent.seo.siteUrl.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
