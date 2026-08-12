import type { Metadata } from "next";
import "../../app/globals.css";
import { Toaster } from "sonner";
import AuthProviders from "./AuthProviders";

export const metadata: Metadata = {
  title: "Wills Farms | Staff Portal",
  description: "Secure login to the Wills Farms management system.",
  icons: {
    icon: "/brand/logo.svg",
    shortcut: "/brand/logo.svg",
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
        <Toaster richColors position="top-center" />
        <AuthProviders>
          <main>{children}</main>
        </AuthProviders>
      </body>
    </html>
  );
}
