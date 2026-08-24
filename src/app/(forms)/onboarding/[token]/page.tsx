import OnboardingWizard from "./OnboardingWizard";
import { FormShell } from "@/components/Forms/FormShell";
import CandidateProfileReview from "@/components/onboarding/CandidateProfileReview";
import type { OnboardingFlatValues } from "@/lib/careers/onboardingFormSchema";
import type { OnboardingFormField } from "@/lib/careers/onboardingFormSchema";
import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";

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
  const {
    application,
    submitted,
    initial_flat,
    fields,
    option_lists,
    expires_at,
    submitted_at,
    application_form_data,
    form_data,
  } = json.data;

  if (submitted) {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Your employee profile">
        <p className="text-sm text-gray-600 mb-6 print:hidden">
          Your onboarding is complete
          {submitted_at ? ` (submitted ${new Date(submitted_at).toLocaleDateString("en-GB")})` : ""}.
          Below is your full record from job application through onboarding. You can print a copy
          for your records.
        </p>
        <CandidateProfileReview
          applicationFormData={application_form_data as Record<string, unknown> | null}
          onboardingFormData={form_data as OnboardingFormData}
          header={{
            fullName: application.full_name,
            roleTitle: application.role_title,
            referenceNumber: application.reference_number,
            submittedAt: submitted_at,
            email: application.email,
            phone: application.phone,
          }}
        />
      </FormShell>
    );
  }

  return (
    <OnboardingWizard
      token={token}
      application={application}
      applicationFormData={application_form_data as Record<string, unknown> | null}
      initialFlat={initial_flat as OnboardingFlatValues}
      fields={fields as OnboardingFormField[]}
      optionLists={option_lists as Record<string, string[]>}
      expiresAt={expires_at}
    />
  );
}
