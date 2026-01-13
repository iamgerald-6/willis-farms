"use client";
import { siteContent } from "@/content/siteContent";
import { Hero } from "@/components/Hero";
import { Container } from "@/components/Container";
import { SectionHeading } from "@/components/SectionHeading";
import { ProductTiles } from "@/components/ProductTiles";
import { FeatureGrid } from "@/components/FeatureGrid";
import { OperatingDiagram } from "@/components/OperatingDiagram";
import { Testimonials } from "@/components/Testimonials";
import { CTA } from "@/components/CTA";
import { LeadForm } from "@/components/Forms/LeadForm";
import { toWhatsAppHref } from "@/lib/utils";
import Image from "next/image";
import { useState, useEffect } from "react";

export default function HomePage() {
  const h = siteContent.home;
  const whatsappHref = toWhatsAppHref(
    siteContent.contact.whatsappNumber,
    "Hello Wills Farms. I would like to make an inquiry (please indicate: Gilts or Pork)."
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const images = [
    "/images/whychooseus1.jpg",
    "/images/whychooseus2.jpg",
    "/images/whychooseus3.jpg",
  ];
  // Change image every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Hero
        headline={h.hero.headline}
        subhead={h.hero.subhead}
        primaryCta={h.hero.primaryCta}
        secondaryCta={h.hero.secondaryCta}
        proof={h.proofBar}
      />

      <section className="bg-white py-14">
        <Container className="space-y-10">
          <SectionHeading
            eyebrow="Offerings"
            title="What we supply"
            subtitle="Two high-value lines built on disciplined genetics, professional management systems, and biosecurity-led operations."
          />
          <ProductTiles tiles={h.productTiles} />
        </Container>
      </section>
      <section className="bg-gray-100 py-14">
        <Container>
          <SectionHeading
            eyebrow="Why Wills Farms"
            title="Built for performance, trust, and reliability"
            subtitle="We win with discipline—genetics, health protection, documentation, and predictable execution."
          />
          <div className="mt-12 grid gap-12  ">
            <div className="relative h-64 sm:h-72 lg:h-96 w-full overflow-hidden rounded-xl  border-black/5 shadow-soft">
              {images.map((img, idx) => (
                <Image
                  key={img}
                  src={img}
                  alt="why us"
                  fill
                  className={`object-cover transition-opacity duration-1000 ${
                    idx === currentIndex ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
            </div>
            <div>
              <FeatureGrid items={h.pillars} />
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-white py-14">
        <Container>
          <div className="grid gap-12 ">
            {/* LEFT: Text & steps */}
            <div className="space-y-10">
              <SectionHeading
                eyebrow="Operating model"
                title="How we operate"
                subtitle="A practical, genetics-led value chain from disciplined production to reliable supply."
              />

              {/* Steps component */}
              <OperatingDiagram steps={siteContent.services.steps} />
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-brand-red py-9">
        <Container className="space-y-10 text-white">
          <SectionHeading
            eyebrow="Partners"
            title="A member of the E-zootech Genetics network. Serving Ghana and West Africa with disciplined genetics and reliable supply."
            textColor="text-brand-light"
            textColor2="text-gray-200"
          />
          <div className="grid gap-5 md:grid-cols-2 ">
            {siteContent.partners.roles.map((r) => (
              <div key={r.name} className=" p-7">
                <p className="text-base font-bold text-brand-light text-center">
                  {r.name}
                </p>
                <div className="flex justify-center">
                  <Image
                    src={r.image}
                    alt="partners"
                    height={40}
                    width={100}
                    className={`transition-opacity duration-1000`}
                  />
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-brand-light py-14">
        <Container className="space-y-10">
          <SectionHeading
            eyebrow="Proof"
            title="What buyers and farms say"
            // subtitle="Replace these placeholders with verified testimonials once you have written approvals."
          />
          <Testimonials />
        </Container>
      </section>

      <section className="bg-white py-14">
        <Container className="space-y-10">
          <SectionHeading
            eyebrow="Inquiries"
            title="Request gilts or a pork supply quote"
            subtitle="Fast, structured capture for qualified leads. Select your interest and provide the details we need."
            right={
              <a
                href={whatsappHref}
                id="whatsapp"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-brand-dark ring-1 ring-black/10 shadow-soft hover:bg-brand-light"
              >
                WhatsApp click-to-chat
              </a>
            }
          />
          <LeadForm defaultType="gilts" />
          {/* <CTA
            title="Ready to proceed?"
            body="Submit your request and we will confirm availability, scheduling, and documentation requirements. For buyers, we can schedule a procurement call to align volumes and delivery cadence."
            primary={{
              label: "Request Gilts",
              href: "/contact?interest=gilts",
            }}
            secondary={{
              label: "Request Supply Quote",
              href: "/contact?interest=pork",
            }}
          /> */}
        </Container>
      </section>
    </>
  );
}
