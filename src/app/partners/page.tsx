import { PageShell } from "@/components/PageShell";
import { SectionHeading } from "@/components/SectionHeading";
import { siteContent } from "@/content/siteContent";
import { CTA } from "@/components/CTA";

export default function PartnersPage() {
  const p = siteContent.partners;

  return (
    <PageShell title={p.headline} subtitle={p.intro}>
      <section className="space-y-6">
        <SectionHeading
          eyebrow="Network"
          title="Clear roles, simple collaboration"
          subtitle="We explain partner roles transparently so customers understand how to buy and who supports which functions."
        />
        <div className="grid gap-5 md:grid-cols-3">
          {p.roles.map((r) => (
            <div
              key={r.name}
              className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
            >
              <p className="text-base font-bold text-brand-dark">{r.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-brand-gray">
                {r.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <CTA
        title="Need West Africa coverage support?"
        body="If you are outside Ghana or prefer channel support, we can connect you through the appropriate E-zootech commercial coverage while maintaining documentation and quality expectations."
        primary={{ label: "Request Gilts", href: "/contact?interest=gilts" }}
        secondary={{ label: "Contact", href: "/contact" }}
      />
    </PageShell>
  );
}
