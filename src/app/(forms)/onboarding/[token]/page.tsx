import OnboardingWizard from "./OnboardingWizard";
import { FormShell } from "@/components/Forms/FormShell";
import { mergeOnboardingForm, type OnboardingFormData } from "@/lib/careers/onboardingTypes";

type PageProps = { params: Promise<{ token: string }> };

export default async function OnboardingPage({ params }: PageProps) {
  const { token } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const res = await fetch(`${baseUrl}/api/careers/onboarding/${token}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Onboarding unavailable">
        <p className="text-sm text-gray-600 text-center py-10">
          {json.error ?? "This link is invalid or has expired. Contact HR at info@willsfarms.com for assistance."}
        </p>
      </FormShell>
    );
  }

  const json = await res.json();
  const { application, submitted, form_data, expires_at, submitted_at } = json.data;

  if (submitted) {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Onboarding already submitted">
        <p className="text-sm text-gray-600 text-center py-10">
          Your onboarding was received
          {submitted_at ? ` on ${new Date(submitted_at).toLocaleDateString("en-GB")}` : ""}.
          HR will contact you with next steps.
        </p>
      </FormShell>
    );
  }

  return (
    <OnboardingWizard
      token={token}
      application={application}
      initialForm={mergeOnboardingForm(form_data as OnboardingFormData)}
      expiresAt={expires_at}
    />
  );
}
