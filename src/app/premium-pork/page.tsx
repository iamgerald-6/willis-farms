import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { siteContent } from "@/content/siteContent";
import { CTA } from "@/components/CTA";
import Link from "next/link";
import Image from "next/image";

export default function PremiumPorkPage() {
  const p = siteContent.premiumPork;

  return (
    <PageShell title={p.headline} subtitle={p.intro}>
      <section className="space-y-6">
        <SectionHeading
          eyebrow="Commercial Supply"
          title="For qualified commercial and institutional buyers"
          subtitle="We supply to business customers. This website does not offer retail or household sales."
        />
        <div className="rounded-3xl border border-black/5 bg-brand-light p-7">
          <p className="text-sm font-semibold text-brand-dark">
            Customer segments
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-brand-gray">
            {p.segments.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-6">
        <SectionHeading
          eyebrow="Value proposition"
          title="Consistency, hygiene discipline, and documented execution"
          subtitle="Designed for procurement teams that need predictable supply and reliable coordination."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {p.valueProps.map((v) => {
            const Icon = v.icon; // pick the icon dynamically
            return (
              <div
                key={v.title}
                className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft flex flex-col gap-3"
              >
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-red-600">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <p className="text-sm font-semibold text-brand-dark">
                  {v.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-brand-gray">
                  {v.body}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-6">
        <SectionHeading
          eyebrow="Formats"
          title="Available supply formats"
          subtitle="We keep commitments realistic and confirm availability based on your requirements."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {p.formats.map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
            >
              <p className="text-base font-bold text-brand-dark">{f.title}</p>
              <div>
                {f.image && (
                  <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden">
                    <Image
                      src={f.image.src}
                      alt={f.image.alt}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-brand-gray">
                {f.body}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-brand-gray">
          To request a quote, use the{" "}
          <Link
            href="/contact?interest=pork"
            className="font-semibold text-brand-dark hover:underline"
          >
            commercial supply inquiry form.
          </Link>
        </p>
      </section>
      <CTA
        title="Request a supply quote or schedule a procurement call"
        body="Provide buyer type, volumes, preferred format, and delivery location. We will confirm availability and next steps."
        primary={{
          label: "Request Supply Quote",
          href: "/contact?interest=pork",
        }}
        secondary={{
          label: "Schedule a Procurement Call",
          href: "/contact?interest=pork&mode=call",
        }}
      />
    </PageShell>
  );
}
