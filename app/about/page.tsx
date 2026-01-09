"use client";

import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { FeatureGrid } from "@/components/FeatureGrid";
import { CTA } from "@/components/CTA";
import { siteContent } from "@/content/siteContent";
import { Dna, BadgeCheck, FileText, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
export default function AboutPage() {
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
          <h1 className="text-3xl font-extrabold sm:text-5xl">About Us</h1>
          <p className="mt-4 max-w-2xl">
            <Link href="/">Home</Link> | <span>About us</span>
          </p>
        </div>
      </div>
      <PageShell
        title="About Wills Farms"
        subtitle="Wills Farms Ltd is a genetics-led, vertically integrated pork company powered by Axiom Genetics (France). We combine disciplined breeding, biosecurity-led operations, and professional management systems to serve farms and B2B buyers across Ghana and West Africa."
      >
        <section className="py-14">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            {/* LEFT: Text content */}
            <div className="space-y-6">
              <SectionHeading
                eyebrow="Our mission"
                title="Raise performance and reliability in modern pork value chains"
                subtitle="We focus on measurable outcomes: consistent breeding stock performance, disciplined health protection, and dependable supply for qualified B2B partners."
              />

              <div className="rounded-3xl border border-black/5 bg-brand-light p-7">
                <p className="text-sm leading-relaxed text-brand-gray">
                  We operate with strict biosecurity and documented processes
                  designed to protect herd health and maintain predictable
                  outcomes. Our affiliation with Axiom Genetics and the
                  E-zootech Genetics network supports technical alignment,
                  knowledge-sharing, and market reach.
                </p>
              </div>

              {/* Brochure as a button */}
              <a
                href={siteContent.brochure.href}
                className="inline-block rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 transition"
              >
                Download Brochure
              </a>
            </div>

            {/* RIGHT: Image */}
            <div className="relative h-64 sm:h-80 lg:h-full w-full overflow-hidden rounded-3xl">
              <Image
                src="/images/team.jpg"
                alt="Our mission illustration"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeading
            eyebrow="What defines us"
            title="A professional system—not just a farm"
            subtitle="Four operational disciplines underpin how we work with customers and partners."
          />

          <div className="mt-12 grid gap-12  ">
            <div className="relative h-64 sm:h-72 lg:h-96 w-full overflow-hidden rounded-xl  border-black/5 shadow-soft">
              {images.map((img, idx) => (
                <Image
                  key={img}
                  src={img}
                  alt=""
                  fill
                  className={`object-cover transition-opacity duration-1000 ${
                    idx === currentIndex ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
            </div>

            <div>
              <FeatureGrid
                columns={2}
                items={[
                  {
                    title: "Disciplined genetics",
                    body: "A structured breeding program with clear performance expectations and traceability.",
                    icon: Dna,
                  },
                  {
                    title: "Biosecurity-first",
                    body: "Controlled access, quarantine, hygiene routines, and SOPs that protect health and outcomes.",
                    icon: BadgeCheck,
                  },
                  {
                    title: "Documentation discipline",
                    body: "Clear records and guidance to support receiving farms and B2B buyer requirements.",
                    icon: FileText,
                  },
                  {
                    title: "Reliable execution",
                    body: "Professional management systems designed for consistent delivery and long-term partnerships.",
                    icon: Settings,
                  },
                ]}
              />
            </div>
          </div>
        </section>

        <CTA
          title="Talk to us about your requirements"
          body="Whether you are booking parent gilts or requesting B2B pork supply, we will provide a clear response on availability, scheduling, and documentation."
          primary={{ label: "Request Gilts", href: "/contact?interest=gilts" }}
          secondary={{
            label: "Request Pork Supply Quote",
            href: "/contact?interest=pork",
          }}
        />
      </PageShell>
    </div>
  );
}
