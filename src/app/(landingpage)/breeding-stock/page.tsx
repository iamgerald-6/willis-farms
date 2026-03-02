import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { siteContent } from "@/content/siteContent";
import { FAQ } from "@/components/FAQ";
import { CTA } from "@/components/CTA";
import Image from "next/image";

export default function BreedingStockPage() {
  const b = siteContent.breedingStock;

  return (
    <PageShell title={b.headline} subtitle={b.intro}>
      <section className="space-y-6">
        <SectionHeading
          eyebrow="Product line"
          title="Parent gilts for performance-focused farms"
          subtitle="We supply parent gilts with disciplined health assurance and a practical documentation pack that supports receiving-farm success."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {b.products.map((p) => (
            <div
              key={p.name}
              className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
            >
              <h3 className="text-xl font-extrabold text-brand-dark">
                {p.name}
              </h3>
              {p.image && (
                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden">
                  <Image
                    src={p.image.src}
                    alt={p.image.alt}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-brand-gray">
                {p.bullets.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <div className="mt-6">
                <a
                  href={p.file}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 transition"
                >
                  Download Brochure
                </a>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-3xl border border-black/5 bg-brand-light p-7">
          <p className="text-sm leading-relaxed text-brand-gray">
            Note: We do not provide semen or AI services on this website—those
            services will be launched separately. However, we train farmers in
            good and sustainable agricultural practices.
          </p>
        </div>
      </section>

      {/* <section className="space-y-6">
        <SectionHeading
          eyebrow="How to buy"
          title={b.howToBuy.title}
          subtitle="Wills Farms supports a dual-channel sales model to serve Ghana and West Africa efficiently."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {b.howToBuy.channels.map((c) => (
            <div
              key={c.name}
              className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
            >
              <p className="text-base font-bold text-brand-dark">{c.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-brand-gray">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </section> */}

      <section className="space-y-6">
        <SectionHeading
          eyebrow="Assurance"
          title="Documentation pack"
          subtitle="A practical set of materials to support receiving farms and reduce avoidable risks."
        />
        <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft">
          <ul className="list-disc space-y-2 pl-5 text-sm text-brand-gray">
            {b.documentationPack.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <div className="mt-6">
            <a
              href={b.productSheet.href}
              className="inline-block rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 transition"
            >
              Download Product Sheet
            </a>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <SectionHeading
          eyebrow="FAQ"
          title="Common questions"
          subtitle="Clear expectations help ensure smooth delivery and successful outcomes."
        />
        <FAQ items={b.faq} />
      </section>

      <CTA
        title="Request parent gilts"
        body="Submit your inquiry with quantity and delivery window. We will confirm availability, delivery requirements, and the documentation pack details."
        primary={{ label: "Request Gilts", href: "/contact?interest=gilts" }}
        secondary={{ label: "Contact us", href: "/contact" }}
      />
    </PageShell>
  );
}
