import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess, jsonForbidden } from "@/lib/apiRequestAuth";
import {
  buildMedicalExamEmailFromPlainText,
  sendMedicalExaminationEmail,
} from "@/lib/medical/medicalExamEmails";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";

export async function POST(req: NextRequest) {
  const caller = await requireRecruitmentAccess(req, "edit");
  if (!caller) return jsonForbidden("Recruitment edit access is required.");

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const body = (await req.json()) as {
    application_id?: string;
    examination_id?: string;
    hospital_email?: string;
    subject?: string;
    body?: string;
    form_url?: string;
    hr_data?: OnboardingHrData;
  };

  const hospitalEmail = body.hospital_email?.trim();
  if (!hospitalEmail) {
    return NextResponse.json({ error: "Hospital email is required." }, { status: 400 });
  }
  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "Email subject and body are required." }, { status: 400 });
  }

  let examinationId = body.examination_id?.trim();
  if (!examinationId && body.application_id) {
    const { data: exam } = await supabaseAdmin
      .from("medical_examinations")
      .select("id")
      .eq("application_id", body.application_id)
      .maybeSingle();
    examinationId = exam?.id;
  }

  if (!examinationId) {
    return NextResponse.json({ error: "Medical examination not found. Generate the email first." }, { status: 404 });
  }

  const now = new Date().toISOString();

  const wrapped = buildMedicalExamEmailFromPlainText({
    bodyText: body.body.trim(),
    formUrl: body.form_url?.trim() || null,
  });

  const sendResult = await sendMedicalExaminationEmail({
    to: hospitalEmail,
    subject: body.subject.trim(),
    bodyText: wrapped.bodyText,
    bodyHtml: wrapped.bodyHtml,
    cc: caller.email ? [caller.email] : undefined,
  });

  if (!sendResult.sent) {
    return NextResponse.json({ error: sendResult.error ?? "Failed to send email." }, { status: 500 });
  }

  await supabaseAdmin
    .from("medical_examinations")
    .update({
      hospital_email: hospitalEmail,
      link_sent_at: now,
      updated_at: now,
    })
    .eq("id", examinationId);

  if (body.application_id && body.hr_data) {
    const { data: submission } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("hr_data")
      .eq("application_id", body.application_id)
      .maybeSingle();

    const mergedHr = { ...(submission?.hr_data as object), ...body.hr_data };
    await supabaseAdmin
      .from("onboarding_submissions")
      .update({ hr_data: mergedHr, updated_at: now })
      .eq("application_id", body.application_id);
  }

  return NextResponse.json({ data: { sent: true, link_sent_at: now } });
}
