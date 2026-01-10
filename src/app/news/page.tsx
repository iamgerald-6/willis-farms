import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { siteContent } from "@/content/siteContent";
import { getAllPosts } from "@/content/blog";
import Image from "next/image";

export default function NewsPage() {
  const posts = getAllPosts();

  return (
    <div>
      <div className="relative overflow-hidden md:min-h-[40vh]">
        {/* Hero image */}
        <Image
          src="/images/whychooseus1.jpg"
          alt=""
          fill
          priority
          className="-z-20 object-cover "
        />
        <div className="absolute inset-0 -z-10 bg-black/40" />

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center justify-center md:min-h-[30vh] text-center text-white">
          <h1 className="text-3xl font-extrabold sm:text-5xl">
            News & Insights
          </h1>
          <p className="mt-4 max-w-2xl">
            <Link href="/">Home</Link> | <span>News & Insights</span>
          </p>
        </div>
      </div>
      <PageShell
        title={siteContent.news.headline}
        subtitle={siteContent.news.intro}
      >
        <section className="grid gap-5">
          {posts.map((p) => (
            <article
              key={p.slug}
              className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">
                {p.date}
              </p>
              <h2 className="mt-2 text-xl font-extrabold text-brand-dark">
                <Link href={`/news/${p.slug}`} className="hover:underline">
                  {p.title}
                </Link>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-brand-gray">
                {p.excerpt}
              </p>
              <Link
                href={`/news/${p.slug}`}
                className="mt-4 inline-flex text-sm font-semibold text-brand-dark hover:underline"
              >
                Read more
              </Link>
            </article>
          ))}
        </section>
      </PageShell>
    </div>
  );
}
