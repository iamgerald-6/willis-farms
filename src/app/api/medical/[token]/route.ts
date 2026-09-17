import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { validateMedicalExamToken } from "@/lib/medical/medicalExamTokens";
import type { MedicalExamination, MedicalFormResponses } from "@/lib/medical/medicalFormSchema";
import {
  ensureInvestigationsData,
  validateMedicalResponses,
  withComputedBmi,
} from "@/lib/medical/medicalResponses";
import {
  buildMedicalExamSubmittedEmailHtml,
  sendMedicalExaminationEmail,
} from "@/lib/medical/medicalExamEmails";

function tokenError(reason: "not_found" | "revoked" | "expired") {
  const messages = {
    not_found: "This link is invalid.",
    revoked: "This link has been replaced. Contact Wills Farms HR for a new link.",
    expired: "This link has expired. Contact Wills Farms HR for a new link.",
  };
  return NextResponse.json({ error: messages[reason] }, { status: 410 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const validation = await validateMedicalExamToken(supabaseAdmin, token);
  if (!validation.ok) return tokenError(validation.reason);

  const { data: exam } = await supabaseAdmin
    .from("medical_examinations")
    .select("*")
    .eq("id", validation.examinationId)
    .maybeSingle();

  if (!exam) {
    return NextResponse.json({ error: "Examination not found." }, { status: 404 });
  }

  const row = exam as MedicalExamination;
  const formResponses = withComputedBmi(ensureInvestigationsData(row.form_responses ?? {}));

  return NextResponse.json({
    data: {
      examination: {
        status: row.status,
        form_schema: row.form_schema,
        referral_data: row.referral_data,
        form_responses: formResponses,
        submitted_at: row.submitted_at,
      },
      expires_at: validation.expiresAt,
      read_only: row.status === "submitted",
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const validation = await validateMedicalExamToken(supabaseAdmin, token);
  if (!validation.ok) return tokenError(validation.reason);

  const body = (await req.json()) as {
    form_responses?: MedicalFormResponses;
    finalize?: boolean;
  };

  const { data: exam } = await supabaseAdmin
    .from("medical_examinations")
    .select("*")
    .eq("id", validation.examinationId)
    .maybeSingle();

  if (!exam) {
    return NextResponse.json({ error: "Examination not found." }, { status: 404 });
  }

  const row = exam as MedicalExamination;
  if (row.status === "submitted") {
    return NextResponse.json({ error: "This examination has already been submitted." }, { status: 403 });
  }

  const responses = withComputedBmi(
    ensureInvestigationsData(body.form_responses ?? row.form_responses ?? {}),
  );
  const now = new Date().toISOString();

  if (body.finalize) {
    const errors = validateMedicalResponses(row.form_schema, responses);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }
  }

  const updates: Record<string, unknown> = {
    form_responses: responses,
    updated_at: now,
  };

  if (body.finalize) {
    updates.status = "submitted";
    updates.submitted_at = now;
  }

  const { data: updated, error } = await supabaseAdmin
    .from("medical_examinations")
    .update(updates)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.finalize) {
    const hrEmail = process.env.HR_MEDICAL_INBOX ?? process.env.REPLY_TO_EMAIL;
    if (hrEmail) {
      const referral = row.referral_data;
      const name = referral?.full_name ?? "Candidate";
      const ref = referral?.reference_number ? ` (${referral.reference_number})` : "";
      await sendMedicalExaminationEmail({
        to: hrEmail,
        subject: `Medical examination submitted — ${name}${ref}`,
        bodyText:
          `The occupational medical examination for ${name}${ref} has been submitted by the facility.\n\n` +
          `Review it in Recruitment → Onboarding.`,
        bodyHtml: buildMedicalExamSubmittedEmailHtml({
          candidateName: name,
          referenceNumber: referral?.reference_number,
        }),
      }).catch(() => undefined);
    }

    const { data: submission } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("hr_data")
      .eq("application_id", row.application_id)
      .maybeSingle();

    const hrData = { ...(submission?.hr_data as object) };
    await supabaseAdmin
      .from("onboarding_submissions")
      .update({
        hr_data: {
          ...hrData,
          medical_report_received: now.slice(0, 10),
          fitness_determination:
            responses.fields?.fitness?.toString() ?? (hrData as { fitness_determination?: string }).fitness_determination,
        },
        updated_at: now,
      })
      .eq("application_id", row.application_id);
  }

  return NextResponse.json({ data: { examination: updated } });
}
