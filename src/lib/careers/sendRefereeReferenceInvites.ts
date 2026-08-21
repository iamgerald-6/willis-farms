import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRefereeReferenceInviteEmail } from "@/lib/careers/interviewEmails";
import { extractRefereesFromApplication } from "@/lib/careers/refereeReferenceTypes";
import { createRefereeReferenceToken } from "@/lib/careers/refereeReferenceTokens";

export type SendRefereeInvitesResult = {
  sent: number;
  skipped: number;
  errors: string[];
};

/** Create tokens and email each referee when a job application is submitted. */
export async function sendRefereeReferenceInvites(
  supabase: SupabaseClient,
  params: {
    applicationId: string;
    formData: Record<string, unknown>;
    candidateName: string;
    roleTitle: string;
    referenceNumber: string;
  },
): Promise<SendRefereeInvitesResult> {
  const referees = extractRefereesFromApplication(params.formData);
  const result: SendRefereeInvitesResult = { sent: 0, skipped: 0, errors: [] };

  if (referees.length === 0) {
    result.errors.push(
      "No referee email on the application — add at least one referee with a name and valid email address.",
    );
    return result;
  }

  for (const referee of referees) {
    const { data: existingSubmission } = await supabase
      .from("referee_reference_submissions")
      .select("submitted_at")
      .eq("application_id", params.applicationId)
      .eq("referee_index", referee.index)
      .maybeSingle();

    if (existingSubmission?.submitted_at) {
      result.skipped += 1;
      continue;
    }

    try {
      const { token, expiresAt } = await createRefereeReferenceToken(supabase, {
        applicationId: params.applicationId,
        refereeIndex: referee.index,
        refereeName: referee.name,
        refereeEmail: referee.email,
      });

      const emailResult = await sendRefereeReferenceInviteEmail({
        refereeName: referee.name,
        refereeEmail: referee.email,
        candidateName: params.candidateName,
        roleTitle: params.roleTitle,
        referenceNumber: params.referenceNumber,
        accessToken: token,
        expiresAt: expiresAt,
      });

      if (emailResult.sent) {
        result.sent += 1;
      } else {
        result.errors.push(
          `Referee ${referee.index} (${referee.email}): ${emailResult.error ?? "Email not sent"}`,
        );
      }
    } catch (err) {
      result.errors.push(
        `Referee ${referee.index} (${referee.email}): ${err instanceof Error ? err.message : "Failed"}`,
      );
    }
  }

  return result;
}

export async function fetchRefereeSubmissionsForApplication(
  supabase: SupabaseClient,
  applicationId: string,
) {
  const { data: application } = await supabase
    .from("job_applications")
    .select("application_form_data")
    .eq("id", applicationId)
    .single();

  const formData = (application?.application_form_data ?? {}) as Record<string, unknown>;
  const contacts = extractRefereesFromApplication(formData);

  const { data: submissions } = await supabase
    .from("referee_reference_submissions")
    .select("referee_index, form_data, submitted_at")
    .eq("application_id", applicationId);

  const submissionByIndex = new Map(
    (submissions ?? []).map((s) => [s.referee_index, s]),
  );

  return contacts.map((contact) => {
    const sub = submissionByIndex.get(contact.index);
    return {
      referee_index: contact.index,
      referee_name: contact.name,
      referee_email: contact.email,
      relationship: contact.relationship,
      phone: contact.phone,
      submitted_at: sub?.submitted_at ?? null,
      form_data: (sub?.form_data ?? {}) as Record<string, unknown>,
    };
  });
}

export type RefereeHrContextRow = {
  referee_index: 1 | 2;
  referee_name: string;
  referee_email: string;
  relationship: string;
  phone: string;
  invite_sent_at: string | null;
  submitted_at: string | null;
};

export type OnboardingHrReferenceContext = {
  application_submitted_at: string | null;
  referees: RefereeHrContextRow[];
  medical: {
    acknowledged_referral: boolean;
    medical_report_uploaded: boolean;
    medical_report_url: string | null;
    medical_step_completed_at: string | null;
  };
};

/** Context HR needs at the top of onboarding review — when invites went out, referee status, medical. */
export async function fetchOnboardingHrReferenceContext(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<OnboardingHrReferenceContext> {
  const { data: application } = await supabase
    .from("job_applications")
    .select("updated_at, created_at, submission_status")
    .eq("id", applicationId)
    .maybeSingle();

  const application_submitted_at =
    application?.submission_status === "submitted"
      ? application.updated_at ?? application.created_at ?? null
      : null;

  const refereeRows = await fetchRefereeSubmissionsForApplication(supabase, applicationId);

  const { data: tokens } = await supabase
    .from("referee_reference_tokens")
    .select("referee_index, last_sent_at, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  const inviteSentByIndex = new Map<number, string>();
  for (const token of tokens ?? []) {
    if (inviteSentByIndex.has(token.referee_index)) continue;
    const sentAt = token.last_sent_at ?? token.created_at;
    if (sentAt) inviteSentByIndex.set(token.referee_index, sentAt);
  }

  const referees: RefereeHrContextRow[] = refereeRows.map((row) => ({
    referee_index: row.referee_index,
    referee_name: row.referee_name,
    referee_email: row.referee_email,
    relationship: row.relationship,
    phone: row.phone,
    invite_sent_at: inviteSentByIndex.get(row.referee_index) ?? null,
    submitted_at: row.submitted_at,
  }));

  const { data: onboardingRow } = await supabase
    .from("onboarding_submissions")
    .select("form_data, medical_completed_at")
    .eq("application_id", applicationId)
    .maybeSingle();

  const formData = (onboardingRow?.form_data ?? {}) as {
    medical?: {
      acknowledge_referral?: boolean;
      medical_report?: { secure_url?: string };
    };
  };
  const medicalReport = formData.medical?.medical_report;

  return {
    application_submitted_at,
    referees,
    medical: {
      acknowledged_referral: formData.medical?.acknowledge_referral === true,
      medical_report_uploaded: Boolean(medicalReport?.secure_url),
      medical_report_url: medicalReport?.secure_url ?? null,
      medical_step_completed_at: onboardingRow?.medical_completed_at ?? null,
    },
  };
}
