import Link from "next/link";
import Image from "next/image";
import { siteContent } from "@/content/siteContent";
import { Container } from "./Container";
import { toTelHref } from "@/lib/utils";

export function Footer() {
  const c = siteContent.contact;
  return (
    <footer className="border-t border-black/5 bg-white">
      <Container className="py-12">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-4">
            <Image
              src={siteContent.brand.logo.src}
              alt={siteContent.brand.logo.alt}
              width={140}
              height={56}
            />
            <p className="text-sm text-brand-gray">{siteContent.affiliation.subline}</p>
          </div>

          <div className="grid gap-2 text-sm">
            <p className="font-semibold text-brand-dark">Contact</p>
            <p className="text-brand-gray">{c.locationAddress}</p>
            <p className="text-brand-gray">Postal: {c.postalAddress}</p>
            <p className="text-brand-gray">
              Email:{" "}
              <a className="font-medium text-brand-dark hover:underline" href={`mailto:${c.email}`}>
                {c.email}
              </a>
            </p>
            <p className="text-brand-gray">
              Tel:{" "}
              {c.phones.map((p, i) => (
                <span key={p}>
                  <a className="font-medium text-brand-dark hover:underline" href={toTelHref(p)}>
                    {p}
                  </a>
                  {i < c.phones.length - 1 ? " / " : ""}
                </span>
              ))}
            </p>
          </div>

          <div className="grid gap-2 text-sm">
            <p className="font-semibold text-brand-dark">Quick links</p>
            {siteContent.nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-brand-gray hover:text-brand-dark hover:underline">
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-black/5 pt-6 text-xs text-brand-gray md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} {siteContent.brand.name}. All rights reserved.</p>
          <p>Powered by Axiom Genetics, France. Member of the E-zootech Genetics network.</p>
        </div>
      </Container>
    </footer>
  );
}
