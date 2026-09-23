import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireRecruitmentAccess } from "@/lib/apiRequestAuth";
import { toNextRequest } from "@/lib/apiPagesAuth";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { buildMedicalExamPdf } from "@/lib/medical/buildMedicalExamPdf";
import { sendMedicalExamSubmittedNoticeEmail } from "@/lib/medical/medicalExamEmails";

// Pages Router — PDF generation via @react-pdf/renderer (see reports/medical-examination/pdf.ts).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const caller = await requireRecruitmentAccess(toNextRequest(req), "edit");
  if (!caller) {
    return res.status(403).json({ error: "Recruitment edit access is required." });
  }

  try {
    const {
      application_id,
      notice_recipient_user_ids,
      history_id,
      summary_report,
    }: {
      application_id?: string;
      notice_recipient_user_ids?: string[];
      history_id?: string;
      summary_report?: string;
    } = req.body ?? {};

    if (!application_id) {
      return res.status(400).json({ error: "application_id is required." });
    }

    const noticeIds = Array.isArray(notice_recipient_user_ids)
      ? notice_recipient_user_ids.filter((id) => typeof id === "string" && id.trim())
      : [];

    if (noticeIds.length === 0) {
      return res.status(400).json({
        error: "Select at least one executive or HR colleague to copy.",
      });
    }

    const summaryReport = summary_report?.trim();
    if (!summaryReport) {
      return res.status(400).json({
        error: "Generate the medical report summary before sending.",
      });
    }

    const { data: application, error: appError } = await supabaseAdmin
      .from("job_applications")
      .select("id, full_name, role_title, reference_number")
      .eq("id", application_id)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: "Application not found." });
    }

    const pdfResult = await buildMedicalExamPdf(
      supabaseAdmin,
      application_id,
      history_id,
    );

    if (!pdfResult.ok) {
      return res.status(pdfResult.status).json({ error: pdfResult.error });
    }

    const { data: callerRow } = await supabaseAdmin
      .from("users")
      .select("first_name, last_name, job_position, email, is_disabled")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!callerRow?.email?.trim() || callerRow.is_disabled) {
      return res.status(400).json({
        error: "Your account has no email on file — add one under Access Control first.",
      });
    }

    const submittedByName =
      `${callerRow.first_name ?? ""} ${callerRow.last_name ?? ""}`.trim() || caller.name;
    const submittedByTitle = callerRow.job_position?.trim() || caller.role;

    const { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("user_id, email, is_disabled")
      .in("user_id", noticeIds);

    if (usersError) {
      return res.status(500).json({ error: usersError.message });
    }

    const ccEmails = noticeIds
      .map((id) => (users ?? []).find((u) => u.user_id === id))
      .filter((u) => u && !u.is_disabled && u.email?.trim())
      .map((u) => u!.email!.trim());

    if (ccEmails.length === 0) {
      return res.status(400).json({ error: "Selected colleagues have no email on file." });
    }

    const noticeResult = await sendMedicalExamSubmittedNoticeEmail({
      hrEmail: callerRow.email.trim(),
      ccEmails,
      submittedByName,
      submittedByTitle,
      candidateName: application.full_name,
      roleTitle: application.role_title,
      referenceNumber: application.reference_number,
      pdfBuffer: pdfResult.buffer,
      pdfFilename: pdfResult.filename,
      summaryReport,
    });

    if (!noticeResult.sent) {
      return res.status(500).json({ error: noticeResult.error ?? "Failed to send email." });
    }

    const { data: submission } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("hr_data, form_data")
      .eq("application_id", application_id)
      .maybeSingle();

    const hr = (submission?.hr_data ?? {}) as OnboardingHrData;
    const now = new Date().toISOString();

    await supabaseAdmin.from("onboarding_submissions").upsert(
      {
        application_id,
        form_data: submission?.form_data ?? {},
        hr_data: {
          ...hr,
          medical_exam_notice_sent_at: now,
          medical_exam_intel_summary: summaryReport,
        },
      },
      { onConflict: "application_id" },
    );

    return res.status(200).json({
      success: true,
      data: { notice_sent: true },
    });
  } catch (err) {
    console.error("[POST /api/careers/medical-examination/notify]", err);
    return res.status(500).json({ error: "Failed to send medical examination email." });
  }
}
