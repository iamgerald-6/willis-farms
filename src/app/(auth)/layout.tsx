import type { Metadata } from "next";
import "../../app/globals.css";

export const metadata: Metadata = {
  title: "Wills Farms | Staff Portal",
  description: "Secure login to the Wills Farms management system.",
  icons: {
    icon: "/brand/willsfarms-logo.png",
    shortcut: "/brand/willsfarms-logo.png",
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
