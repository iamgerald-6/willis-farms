import type { SupabaseClient } from "@supabase/supabase-js";
import { onboardingMagicLinkUrl } from "@/lib/appUrl";
import { sendHireOnboardingEmail } from "@/lib/careers/interviewEmails";
import { createOnboardingToken } from "@/lib/careers/onboardingTokens";

export type OnboardingApplicationRef = {
  id: string;
  full_name: string;
  email: string;
  role_title: string;
  reference_number: string;
};

export type SendOnboardingInviteResult = {
  tokenId: string;
  expiresAt: string;
  emailSent: boolean;
  emailError?: string;
};

/**
 * Creates/refreshes the onboarding token, ensures an onboarding_submissions row
 * exists, optionally sets job_applications.status to onboarding, and emails the link.
 */
export async function sendOnboardingInvite(
  supabase: SupabaseClient,
  application: OnboardingApplicationRef,
  options?: {
    recommendedStartDate?: string;
    /** When false, caller has already set status to onboarding (e.g. confirm_decision). */
    updateStatus?: boolean;
  },
): Promise<SendOnboardingInviteResult> {
  const tokenRecord = await createOnboardingToken(supabase, application.id);
  const onboardingLink = onboardingMagicLinkUrl(tokenRecord.token);

  const { error: submissionError } = await supabase.from("onboarding_submissions").upsert(
    {
      application_id: application.id,
      token_id: tokenRecord.id,
      form_data: {},
      hr_data: {},
    },
    { onConflict: "application_id" },
  );

  if (submissionError) {
    throw new Error(submissionError.message);
  }

  if (options?.updateStatus !== false) {
    const { error: statusError } = await supabase
      .from("job_applications")
      .update({ status: "onboarding" })
      .eq("id", application.id);

    if (statusError) {
      throw new Error(statusError.message);
    }
  }

  const emailResult = await sendHireOnboardingEmail({
    candidateName: application.full_name,
    candidateEmail: application.email,
    roleTitle: application.role_title,
    referenceNumber: application.reference_number,
    onboardingLink,
    expiresAt: tokenRecord.expiresAt,
    recommendedStartDate: options?.recommendedStartDate,
  });

  return {
    tokenId: tokenRecord.id,
    expiresAt: tokenRecord.expiresAt,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.error,
  };
}
