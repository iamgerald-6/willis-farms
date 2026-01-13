"use client";

import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { FeatureGrid } from "@/components/FeatureGrid";
import { CTA } from "@/components/CTA";
import { siteContent } from "@/content/siteContent";
import {
  Dna,
  BadgeCheck,
  FileText,
  Settings,
  Leaf,
  Shield,
  CheckCircle,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useState, useEffect, SVGProps } from "react";
import Timeline from "@/components/Timeline";
export default function AboutPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const images = [
    "/images/whychooseus1.jpg",
    "/images/whychooseus2.jpg",
    "/images/whychooseus3.jpg",
  ];
  const goalsTimeline = siteContent.home.goals.map((goal) => ({
    title: goal.title,
    description: goal.description,
    icon: React.createElement(goal.icon, { className: `h-5 w-5` }),
    color: goal.color,
  }));

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
        subtitle="Wills Farms Ltd is a genetics-led, vertically integrated pork company powered by Axiom Genetics (France). We combine disciplined breeding, biosecurity-led operations, and professional management systems to serve farms and buyers across Ghana and West Africa."
      >
        <section className="py-14">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            {/* LEFT: Text content */}
            <div className="space-y-6">
              <SectionHeading
                eyebrow="Our mission"
                title="Raise performance and reliability in modern pork value chains"
                subtitle="At Wills Farms Ltd, we sustainably innovate to grow and deliver ethical, quality food for all."
              />
              <SectionHeading
                eyebrow="Our Vision"
                title="Shaping the future of modern pork value chains"
                subtitle="We Aspire to be a leading agribusiness group rooted in innovation sustainability."
              />
              <SectionHeading
                eyebrow="Philosophy"
                title="Guided by people, pigs, and the planet"
                subtitle="People, Pigs and Planet."
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

        <section className="py-20 bg-neutral-50">
          <div className="container mx-auto px-6">
            {/* Section Header */}
            <SectionHeading
              eyebrow="Core Values"
              title="What guides everything we do"
            />

            {/* Image + Content */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:gap-16">
              {/* Left Image */}
              <div className="lg:w-1/2 mb-10 lg:mb-0 relative h-64 sm:h-80 lg:h-[500px] w-full rounded-3xl overflow-hidden">
                <Image
                  src="/images/coreVal.jpg"
                  alt="Our mission illustration"
                  fill
                  className="object-cover"
                />
              </div>

              {/* Right Content */}
              <div className="lg:w-1/2 space-y-8">
                {/* Sustainability */}
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                    <Leaf className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-1">
                      Sustainability
                    </h3>
                    <p className="text-gray-600">
                      We have a deep commitment to environmental stewardship,
                      resource conservation, and sustainable agricultural
                      practices.
                    </p>
                  </div>
                </div>

                {/* Ethical Practices */}
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                    <Shield className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-1">
                      Ethical Practices
                    </h3>
                    <p className="text-gray-600">
                      The emphasis on ethics in our mission implies a strong
                      value placed on integrity, transparency, fairness, and
                      responsibility in all business operations and
                      relationships.
                    </p>
                  </div>
                </div>

                {/* Quality Commitment */}
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-1">
                      Quality Commitment
                    </h3>
                    <p className="text-gray-600">
                      We strive to maintain high standards in food safety,
                      nutrition, and taste — this is a fundamental value.
                    </p>
                  </div>
                </div>

                {/* Innovation */}
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                    <Zap className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-1">Innovation</h3>
                    <p className="text-gray-600">
                      We are committed to innovation. This value is central to
                      our approach, encompassing a continuous pursuit of
                      improvement, embracing new technologies, and finding
                      creative solutions to challenges in agriculture and food
                      production.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-white">
          <SectionHeading
            eyebrow="Sustainability at Wills Farm Ltd"
            title="Developed in Line with the We Care principles and goals"
          />
          <div className="mt-5">
            <Timeline events={goalsTimeline} />
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
