"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { siteContent } from "@/content/siteContent";
import type { JobPosting } from "@/lib/careers/jobPostings";
import { formatPublicJobTitle, previewDescription } from "@/lib/careers/jobPostings";
import Image from "next/image";

function JobCard({ posting }: { posting: JobPosting }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft">
      <p className="text-base font-bold text-brand-dark">
        {formatPublicJobTitle(posting.title)}
      </p>
      <p className="mt-2 text-sm text-brand-gray">
        {posting.location} · {posting.employment_type}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-brand-gray">
        {expanded ? posting.description : previewDescription(posting.description)}
      </p>
      {posting.description.length > 220 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-semibold text-brand-red hover:underline"
        >
          {expanded ? "View less" : "View more"}
        </button>
      )}
      <p className="mt-3 text-xs text-brand-gray">
        Applications close{" "}
        {new Date(posting.closes_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
      <Link
        href={`/apply/${posting.id}`}
        className="mt-5 inline-flex rounded-2xl bg-brand-red px-4 py-2 text-sm font-semibold text-white shadow-soft hover:opacity-90"
      >
        Apply now
      </Link>
    </div>
  );
}

export default function CareersPageClient({
  postings,
}: {
  postings: JobPosting[];
}) {
  const c = siteContent.careers;

  return (
    <div>
      <div className="relative overflow-hidden md:min-h-[40vh]">
        <Image
          src="/images/whychooseus1.jpg"
          alt=""
          fill
          priority
          className="-z-20 object-cover "
        />
        <div className="absolute inset-0 -z-10 bg-black/40" />

        <div className="relative z-10 flex flex-col items-center justify-center md:min-h-[30vh] text-center text-white">
          <h1 className="text-3xl font-extrabold sm:text-5xl">Career</h1>
          <p className="mt-4 max-w-2xl">
            <Link href="/">Home</Link> | <span>Career</span>
          </p>
        </div>
      </div>
      <PageShell title={c.headline} subtitle={c.intro}>
        <section className="space-y-6">
          <SectionHeading
            eyebrow="Openings"
            title="Current opportunities"
            subtitle="Browse our open roles and apply online. Shortlisted candidates will be invited to interview."
          />

          {postings.length === 0 ? (
            <div className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-soft">
              <p className="text-sm text-brand-gray">
                There are no open positions at the moment. Please check back soon or email{" "}
                <a
                  href="mailto:info@willsfarms.com"
                  className="font-semibold text-brand-red hover:underline"
                >
                  info@willsfarms.com
                </a>{" "}
                to register your interest.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {postings.map((posting) => (
                <JobCard key={posting.id} posting={posting} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-brand-light p-7 ring-1 ring-black/5">
          <p className="text-base font-bold text-brand-dark">Questions?</p>
          <p className="mt-2 text-sm leading-relaxed text-brand-gray">
            Email{" "}
            <a
              href="mailto:info@willsfarms.com"
              className="font-semibold text-brand-red hover:underline"
            >
              info@willsfarms.com
            </a>{" "}
            with your reference number if you need to follow up on an application.
          </p>
        </section>
      </PageShell>
    </div>
  );
}
