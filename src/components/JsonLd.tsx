import { siteContent } from "@/content/siteContent";

export function JsonLd() {
  const c = siteContent.contact;

  const org = {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness"],
    name: siteContent.brand.name,
    url: siteContent.seo.siteUrl,
    logo: `${siteContent.seo.siteUrl}${siteContent.brand.logo.src}`,
    email: c.email,
    telephone: c.phones,
    address: {
      "@type": "PostalAddress",
      streetAddress: c.locationAddress,
      addressLocality: "Yaw Densu",
      addressRegion: "Eastern Region",
      addressCountry: "GH",
      postalCode: "EG-508-0449",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }}
    />
  );
}
