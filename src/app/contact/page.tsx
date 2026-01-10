import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { siteContent } from "@/content/siteContent";
import { LeadForm } from "@/components/Forms/LeadForm";
import { toTelHref, toWhatsAppHref } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

export default function ContactPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[]>;
}) {
  const interestRaw = (searchParams?.interest ?? "gilts") as string | string[];
  const interest = Array.isArray(interestRaw) ? interestRaw[0] : interestRaw;
  const defaultType = interest === "pork" ? "pork" : "gilts";

  const whatsappHref = toWhatsAppHref(
    siteContent.contact.whatsappNumber,
    "Hello Wills Farms. I would like to make an inquiry (please indicate: Gilts or Pork B2B)."
  );

  const c = siteContent.contact;

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
          <h1 className="text-3xl font-extrabold sm:text-5xl">Contact</h1>
          <p className="mt-4 max-w-2xl">
            <Link href="/">Home</Link> | <span>Contact</span>
          </p>
        </div>
      </div>
      <PageShell
        title="Contact"
        subtitle="For gilt inquiries/bookings and B2B premium pork supply inquiries. We typically respond within one business day."
      >
        <section className="space-y-6">
          <SectionHeading
            eyebrow="Get in touch"
            title="Submit a structured inquiry"
            subtitle="Select Gilts or Pork (B2B) and provide the details required for a fast response."
          />
          <LeadForm defaultType={defaultType} />
        </section>

        <section className="space-y-6">
          <SectionHeading
            eyebrow="Direct contact"
            title="Contact details"
            subtitle="Use these channels for follow-up or urgent coordination."
          />
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft">
              <p className="text-sm font-semibold text-brand-dark">Address</p>
              <p className="mt-2 text-sm text-brand-gray">
                {c.locationAddress}
              </p>
              <p className="mt-3 text-sm font-semibold text-brand-dark">
                Postal
              </p>
              <p className="mt-2 text-sm text-brand-gray">{c.postalAddress}</p>
            </div>
            <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft">
              <p className="text-sm font-semibold text-brand-dark">Email</p>
              <a
                className="mt-2 inline-flex text-sm font-semibold text-brand-dark hover:underline"
                href={`mailto:${c.email}`}
              >
                {c.email}
              </a>
              <p className="mt-5 text-sm font-semibold text-brand-dark">
                Telephone
              </p>
              <p className="mt-2 text-sm text-brand-gray">
                {c.phones.map((p, i) => (
                  <span key={p}>
                    <a
                      className="font-semibold text-brand-dark hover:underline"
                      href={toTelHref(p)}
                    >
                      {p}
                    </a>
                    {i < c.phones.length - 1 ? " / " : ""}
                  </span>
                ))}
              </p>

              <div
                className="mt-6 rounded-2xl bg-brand-light p-5 ring-1 ring-black/5"
                id="whatsapp"
              >
                <p className="text-sm font-semibold text-brand-dark">
                  WhatsApp
                </p>
                <p className="mt-1 text-sm text-brand-gray">
                  Click to chat for quick inquiries.
                </p>
                <a
                  href={whatsappHref}
                  className="mt-3 inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-brand-dark ring-1 ring-black/10 shadow-soft hover:bg-brand-light"
                >
                  WhatsApp click-to-chat
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-brand-light p-7 ring-1 ring-black/5">
          <p className="text-sm font-semibold text-brand-dark">Note</p>
          <p className="mt-2 text-sm leading-relaxed text-brand-gray">
            This website does not list semen or AI services, and does not offer
            retail/household pork sales. All pork inquiries are B2B.
          </p>
        </section>
      </PageShell>
    </div>
  );
}
