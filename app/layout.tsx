import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { siteContent } from "@/content/siteContent";
import { JsonLd } from "@/components/JsonLd";
import { Analytics } from "@/components/Analytics";
import ClientLayout from "@/components/ClientLayout";
export const metadata: Metadata = {
  metadataBase: new URL(siteContent.seo.siteUrl),
  title: siteContent.seo.title,
  description: siteContent.seo.description,
  openGraph: {
    title: siteContent.seo.title,
    description: siteContent.seo.description,
    url: siteContent.seo.siteUrl,
    siteName: siteContent.brand.name,
    images: [{ url: siteContent.seo.ogImage }],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteContent.seo.title,
    description: siteContent.seo.description,
    images: [siteContent.seo.ogImage],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Analytics />
        <JsonLd />
        {/* <Navbar /> */}
        <main>
          <ClientLayout>{children}</ClientLayout>
        </main>
        {/* <Footer /> */}
      </body>
    </html>
  );
}
