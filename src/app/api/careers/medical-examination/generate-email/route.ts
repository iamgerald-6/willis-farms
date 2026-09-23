import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { buildMedicalReferralData } from "@/lib/medical/medicalReferral";
import {
  buildMedicalExamEmailFallback,
  medicalExamFormUrl,
} from "@/lib/medical/medicalExamEmails";
import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { createMedicalExamToken } from "@/lib/medical/medicalExamTokens";
import { isMedicalFormConfiguredForCategory } from "@/lib/medical/medicalExamRequirementsMatrix";
import type { MedicalReferralData } from "@/lib/medical/medicalFormSchema";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EMAIL_TOOL = {
  name: "record_medical_referral_email",
  description: "Records a professional email to a hospital or clinic requesting an occupational medical examination.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: { type: "string", description: "Email subject line." },
      body: {
        type: "string",
        description:
          "Full email body in plain text only. Do NOT use markdown, asterisks, or hash symbols for bold or headings — write section titles as plain lines ending with a colon (e.g. 'Candidate details:'). Professional tone. Include candidate name, job reference, examination type, facility/appointment if provided, and instructions that results go to HR only. Do not mention internal systems, databases, or 'save to server'. End with a sign-off from Wills Farms HR.",
      },
    },
    required: ["subject", "body"],
  },
};

export async function POST(req: NextRequest) {
  const caller = await requireRecruitmentAccess(req, "edit");
  if (!caller) return jsonForbidden("Recruitment edit access is required.");

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = (await req.json()) as {
    application_id?: string;
    hospital_email?: string;
    hr_data?: OnboardingHrData;
  };

  if (!body.application_id?.trim()) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const { data: application } = await supabaseAdmin
    .from("job_applications")
    .select("*")
    .eq("id", body.application_id)
    .maybeSingle();

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const { data: submission } = await supabaseAdmin
    .from("onboarding_submissions")
    .select("form_data, hr_data")
    .eq("application_id", body.application_id)
    .maybeSingle();

  const formData = (submission?.form_data ?? {}) as OnboardingFormData;
  const hrData = { ...(submission?.hr_data as OnboardingHrData), ...(body.hr_data ?? {}) };

  const referral = buildMedicalReferralData({
    application,
    formData,
    hrData,
    issuedByName: caller.name,
  });

  const now = new Date().toISOString();
  let examinationId: string;

  const { data: existingExam } = await supabaseAdmin
    .from("medical_examinations")
    .select("*")
    .eq("application_id", body.application_id)
    .maybeSingle();

  if (existingExam?.status === "submitted") {
    return NextResponse.json(
      { error: "Medical examination already submitted. Resend a new link to start a fresh instance." },
      { status: 400 },
    );
  }

  if (!existingExam) {
    return NextResponse.json(
      {
        error:
          "Configure the hospital form for this job category before generating the email.",
      },
      { status: 400 },
    );
  }

  const existingReferral = (existingExam.referral_data ?? {}) as MedicalReferralData;
  const formConfig = existingReferral.form_config;

  if (!isMedicalFormConfiguredForCategory(formConfig, referral.job_category)) {
    return NextResponse.json(
      {
        error:
          "Configure the hospital form for this job category before generating the email.",
      },
      { status: 400 },
    );
  }

  examinationId = existingExam.id;
  await supabaseAdmin
    .from("medical_examinations")
    .update({
      referral_data: { ...referral, form_config: formConfig },
      hospital_email: body.hospital_email?.trim() || existingExam.hospital_email,
      updated_at: now,
    })
    .eq("id", existingExam.id);

  const { token } = await createMedicalExamToken(supabaseAdmin, examinationId);
  const formUrl = medicalExamFormUrl(token);

  const fallback = buildMedicalExamEmailFallback({
    referral,
    formUrl,
    hrContactName: caller.name,
  });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      data: {
        subject: fallback.subject,
        body: fallback.bodyText,
        form_url: formUrl,
        examination_id: examinationId,
        generated_by: "fallback",
      },
    });
  }

  try {
    const prompt =
      `Draft a professional email from Wills Farms HR to a hospital/clinic requesting an occupational medical examination.\n\n` +
      `Candidate: ${referral.full_name ?? "—"}\n` +
      `Job reference: ${referral.reference_number ?? "—"}\n` +
      `Position: ${referral.position_offered ?? "—"}\n` +
      `Department/site: ${referral.department_site ?? "—"}\n` +
      `Examination type: ${referral.examination_type ?? "Pre-employment"}\n` +
      `Job category: ${referral.job_category ?? "—"}\n` +
      `Facility: ${referral.designated_facility ?? "—"}\n` +
      `Appointment date: ${referral.appointment_date ?? "—"}\n\n` +
      `The email must instruct the facility to complete the online form at a link (do not invent the URL — HR will add it separately). ` +
      `Stress that clinical results must be sent to Wills Farms HR directly, not through the employee. ` +
      `Do not mention software, servers, databases, or internal system names except "Wills Farms". ` +
      `Use plain text only — no markdown, no **asterisks** for bold, no # headings. Section titles as plain lines like "Candidate details:" followed by label: value lines.`;

    const response = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 1200,
      tools: [EMAIL_TOOL],
      tool_choice: { type: "tool", name: "record_medical_referral_email" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    const raw = toolBlock && toolBlock.type === "tool_use" ? (toolBlock.input as { subject?: string; body?: string }) : null;

    const subject = raw?.subject?.trim() || fallback.subject;
    let emailBody = raw?.body?.trim() || fallback.bodyText;
    if (!emailBody.includes(formUrl)) {
      emailBody += `\n\nExamination form:\n${formUrl}`;
    }

    return NextResponse.json({
      data: {
        subject,
        body: emailBody,
        form_url: formUrl,
        examination_id: examinationId,
        generated_by: "intel",
      },
    });
  } catch (err) {
    console.error("[POST /api/careers/medical-examination/generate-email]", err);
    return NextResponse.json({
      data: {
        subject: fallback.subject,
        body: fallback.bodyText,
        form_url: formUrl,
        examination_id: examinationId,
        generated_by: "fallback",
      },
    });
  }
}
