import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { OperatingDiagram } from "@/components/OperatingDiagram";
import { siteContent } from "@/content/siteContent";
import { CTA } from "@/components/CTA";
import Link from "next/link";
import Image from "next/image";
import { Container } from "@/components/Container";
import { ProductTiles } from "@/components/ProductTiles";

export default function OperatingModelPage() {
  const o = siteContent.services;
  const h = siteContent.home;
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
          <h1 className="text-3xl font-extrabold sm:text-5xl">Our Services</h1>
          <p className="mt-4 max-w-2xl">
            <Link href="/">Home</Link> | <span>Our Services</span>
          </p>
        </div>
      </div>
      <PageShell title={""} subtitle={""}>
        <section className="bg-white">
          <Container className="space-y-10">
            <SectionHeading
              eyebrow="Offerings"
              title="What we supply"
              subtitle="Two high-value lines built on disciplined genetics, professional management systems, and biosecurity-led operations."
            />
            <ProductTiles tiles={h.productTiles} />
          </Container>
        </section>
        <section className="space-y-6">
          <SectionHeading
            eyebrow="Visual model"
            title="Genetics → production → processing/cold chain → distribution"
            subtitle="A simplified view of the operating model used to deliver consistent performance and reliable B2B supply."
          />
          <OperatingDiagram steps={o.steps} />
        </section>

        <section className="space-y-6">
          <SectionHeading
            eyebrow="Operating principles"
            title="How we keep outcomes consistent"
            subtitle="We focus on the repeatable disciplines that reduce variability and risk."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Standard routines",
                body: "Documented SOPs, trained staff, and clear accountability.",
              },
              {
                title: "Health protection",
                body: "Biosecurity protocols designed to protect herd health and continuity.",
              },
              {
                title: "Quality communication",
                body: "Clear documentation and buyer communication to support planning.",
              },
            ].map((x) => (
              <div
                key={x.title}
                className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
              >
                <p className="text-base font-bold text-brand-dark">{x.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-brand-gray">
                  {x.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <CTA
          title="Convert planning into supply"
          body="Tell us your requirements and timelines. We will confirm availability and next steps for gilts or B2B pork supply."
          primary={{ label: "Request Gilts", href: "/contact?interest=gilts" }}
          secondary={{
            label: "Request Supply Quote",
            href: "/contact?interest=pork",
          }}
        />
      </PageShell>
    </div>
  );
}
