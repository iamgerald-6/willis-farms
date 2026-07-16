"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { CareersApplyForm } from "@/components/Forms/CareersApplyForm";
import { siteContent } from "@/content/siteContent";
import { ALL_CAREER_OPENINGS } from "@/lib/careers/openings";
import Image from "next/image";
import Link from "next/link";

function scrollToApplyForm() {
  document.getElementById("apply")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

type Props = {
  defaultRoleSlug?: string;
};

export default function CareersPageClient({ defaultRoleSlug }: Props) {
  const c = siteContent.careers;
  const router = useRouter();

  useEffect(() => {
    if (window.location.hash !== "#apply") return;
    const timer = window.setTimeout(scrollToApplyForm, 150);
    return () => window.clearTimeout(timer);
  }, [defaultRoleSlug]);

  const goToApply = (roleSlug: string) => {
    router.push(`/careers?role=${roleSlug}#apply`, { scroll: false });
    window.setTimeout(scrollToApplyForm, 150);
  };

  const displayOpenings = ALL_CAREER_OPENINGS.filter(
    (o, i, arr) => arr.findIndex((x) => x.slug === o.slug) === i,
  );

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
            subtitle="Select a role below or apply to our talent pool. Shortlisted candidates will be invited to interview."
          />
          <div className="grid gap-5 md:grid-cols-2">
            {displayOpenings.map((o) => (
              <div
                key={o.slug}
                className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
              >
                <p className="text-base font-bold text-brand-dark">{o.title}</p>
                <p className="mt-2 text-sm text-brand-gray">
                  {o.location} · {o.type}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-brand-gray">
                  {o.summary}
                </p>
                <button
                  type="button"
                  onClick={() => goToApply(o.slug)}
                  className="mt-5 inline-flex rounded-2xl bg-brand-red px-4 py-2 text-sm font-semibold text-white shadow-soft hover:opacity-90"
                >
                  Apply for this role
                </button>
              </div>
            ))}
          </div>
        </section>

        <CareersApplyForm defaultRoleSlug={defaultRoleSlug} />

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
            with your reference number if you need to follow up on an
            application.
          </p>
        </section>
      </PageShell>
    </div>
  );
}
