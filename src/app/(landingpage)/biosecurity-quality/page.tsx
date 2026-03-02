import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { siteContent } from "@/content/siteContent";
import { CTA } from "@/components/CTA";

export default function BiosecurityQualityPage() {
  const b = siteContent.biosecurityQuality;

  return (
    <PageShell title={b.headline} subtitle={b.intro}>
      <section className="space-y-6">
        <SectionHeading
          eyebrow="Biosecurity advantage"
          title="Designed to protect herd health and buyer confidence"
          subtitle="Protocols and routines that support predictable outcomes and reduce avoidable risk."
        />
        <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft">
          <ul className="list-disc space-y-2 pl-5 text-sm text-brand-gray">
            {b.biosecurity.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-6">
        <SectionHeading
          eyebrow="Quality commitment"
          title="Quality-focused, documentation-led execution"
          subtitle="Careful wording: we do not claim certifications unless formally obtained and verified."
        />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft">
            <p className="text-base font-bold text-brand-dark">Quality checklist</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-brand-gray">
              {b.quality.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <div className="mt-6 rounded-2xl bg-brand-light p-5 ring-1 ring-black/5">
              <p className="text-sm font-semibold text-brand-dark">{b.charter.label}</p>
              <p className="mt-1 text-sm text-brand-gray">{b.charter.note}</p>
              <a
                href={b.charter.href}
                className="mt-3 inline-flex text-sm font-semibold text-brand-dark hover:underline"
              >
                {b.charter.label}
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-black/5 bg-brand-light p-7">
            <p className="text-base font-bold text-brand-dark">What we will not claim</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-brand-gray">
              <li>No invented certifications, export approvals, or laboratory accreditations.</li>
              <li>No claims of third-party audits unless confirmed in writing.</li>
              <li>Language remains “quality-focused” and “biosecurity-led” unless formal certification is obtained.</li>
            </ul>
          </div>
        </div>
      </section>

      <CTA
        title="Align on biosecurity expectations"
        body="If you are receiving breeding stock or procuring B2B supply, we will confirm the required protocols and documentation for a smooth process."
        primary={{ label: "Request Gilts", href: "/contact?interest=gilts" }}
        secondary={{ label: "Request Supply Quote", href: "/contact?interest=pork" }}
      />
    </PageShell>
  );
}
