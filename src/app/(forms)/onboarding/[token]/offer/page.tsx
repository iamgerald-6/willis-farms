import { Suspense } from "react";
import { headers } from "next/headers";
import OnboardingOfferPageClient from "../OnboardingOfferPageClient";
import { FormShell } from "@/components/Forms/FormShell";
import { Loader2 } from "lucide-react";

type PageProps = { params: Promise<{ token: string }> };

async function loadApplication(token: string) {
  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.includes("localhost") ? "http" : "https";
  const baseUrl =
    host != null
      ? `${protocol}://${host}`
      : (process.env.NEXT_PUBLIC_APP_URL ??
        (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000"));

  const res = await fetch(`${baseUrl}/api/careers/onboarding/${token}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data as {
    application: {
      full_name: string;
      role_title: string;
      reference_number: string;
    };
  };
}

function OfferPageFallback() {
  return (
    <FormShell eyebrow="Wills Farms Ltd." title="Your job offer">
      <p className="text-sm text-gray-500 flex items-center justify-center gap-2 py-10">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </p>
    </FormShell>
  );
}

export default async function OnboardingOfferPage({ params }: PageProps) {
  const { token } = await params;
  const data = await loadApplication(token);

  if (!data) {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Onboarding unavailable">
        <p className="text-sm text-gray-600 text-center py-10">
          This link is invalid or has expired.
        </p>
      </FormShell>
    );
  }

  return (
    <Suspense fallback={<OfferPageFallback />}>
      <OnboardingOfferPageClient token={token} application={data.application} />
    </Suspense>
  );
}
