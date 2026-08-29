import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { siteContent } from "@/content/siteContent";
import Image from "next/image";
import Link from "next/link";

export default function CareersPage() {
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
            eyebrow="Job openings"
            title="Current opportunities"
            subtitle="Browse our open roles and apply online. Shortlisted candidates will be invited to interview."
          />

          <div className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-soft">
            <p className="text-base font-semibold text-brand-dark">
              No open positions at the moment
            </p>
            <p className="mt-3 text-sm leading-relaxed text-brand-gray">
              We are not actively recruiting for any roles right now. Please check back soon, or
              email{" "}
              <a
                href="mailto:info@willsfarms.com"
                className="font-semibold text-brand-red hover:underline"
              >
                info@willsfarms.com
              </a>{" "}
              to register your interest in future opportunities.
            </p>
          </div>
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
            and our team will be happy to help.
          </p>
        </section>
      </PageShell>
    </div>
  );
}
