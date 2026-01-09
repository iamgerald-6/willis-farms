import { siteContent } from "./siteContent";

export type BlogPost = typeof siteContent.news.posts[number];

export function getAllPosts(): BlogPost[] {
  return [...siteContent.news.posts].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return siteContent.news.posts.find((p) => p.slug === slug);
}
