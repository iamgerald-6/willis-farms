import OnboardingWizard from "./OnboardingWizard";
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
      <div className="max-w-lg mx-auto py-20 px-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Onboarding link unavailable</h1>
        <p className="text-sm text-gray-600 mt-3">
          {json.error ?? "This link is invalid or has expired. Contact HR at info@willsfarms.com for assistance."}
        </p>
      </div>
    );
  }

  const json = await res.json();
  const { application, submitted, form_data, expires_at, submitted_at } = json.data;

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto py-20 px-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Onboarding already submitted</h1>
        <p className="text-sm text-gray-600 mt-3">
          Your onboarding was received
          {submitted_at ? ` on ${new Date(submitted_at).toLocaleDateString("en-GB")}` : ""}.
          HR will contact you with next steps.
        </p>
      </div>
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
