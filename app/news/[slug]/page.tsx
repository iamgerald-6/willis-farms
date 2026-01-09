import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { getPostBySlug } from "@/content/blog";

export default function PostPage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  if (!post) return notFound();

  return (
    <PageShell title={post.title} subtitle={post.excerpt}>
      <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">
          {post.date}
        </p>
        <div className="mt-6 space-y-4">
          {post.content.map((para, idx) => (
            <p key={idx} className="text-sm leading-relaxed text-brand-gray">
              {para}
            </p>
          ))}
        </div>
        <Link
          href="/news"
          className="mt-8 inline-flex text-sm font-semibold text-brand-dark hover:underline"
        >
          Back to News & Insights
        </Link>
      </div>
    </PageShell>
  );
}
