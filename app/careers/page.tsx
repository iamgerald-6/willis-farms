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
            subtitle="If no role matches your profile, you may still apply to our talent pool."
          />
          <div className="grid gap-5 md:grid-cols-2">
            {c.openings.map((o) => (
              <div
                key={o.title}
                className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
              >
                <p className="text-base font-bold text-brand-dark">{o.title}</p>
                <p className="mt-2 text-sm text-brand-gray">
                  {o.location} · {o.type}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-brand-gray">
                  {o.summary}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-brand-light p-7 ring-1 ring-black/5">
          <p className="text-base font-bold text-brand-dark">How to apply</p>
          <p className="mt-2 text-sm leading-relaxed text-brand-gray">
            {c.howToApply}
          </p>
        </section>
      </PageShell>
    </div>
  );
}
