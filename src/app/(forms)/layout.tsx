import type { Metadata } from "next";
import "../../app/globals.css";
import { Analytics } from "@/components/Analytics";

export const metadata: Metadata = {
  title: "Wills Farms Ltd.",
  robots: { index: false, follow: false },
};

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Analytics />
        {children}
      </body>
    </html>
  );
}
