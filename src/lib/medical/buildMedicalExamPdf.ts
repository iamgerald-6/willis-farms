import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MedicalExamination,
  MedicalExaminationHistoryEntry,
  MedicalFormResponses,
  MedicalReferralData,
} from "@/lib/medical/medicalFormSchema";
import { normalizeMedicalFormSchema } from "@/lib/medical/medicalFormSchema";
import type { MedicalExamPdfPayload } from "@/lib/reports/MedicalExamDocument";
import {
  medicalExamPdfFilename,
  renderMedicalExamPdf,
} from "@/lib/reports/renderMedicalExamPdf";

export type MedicalExamPdfBuildResult =
  | {
      ok: true;
      buffer: Buffer;
      filename: string;
      payload: MedicalExamPdfPayload;
    }
  | { ok: false; status: number; error: string };

export async function buildMedicalExamPdf(
  supabaseAdmin: SupabaseClient,
  applicationId: string,
  historyId?: string | null,
): Promise<MedicalExamPdfBuildResult> {
  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select("full_name")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    return { ok: false, status: 404, error: "Application not found." };
  }

  let rawSchema: unknown;
  let responses: MedicalFormResponses;
  let referral: MedicalReferralData;
  let status: string;
  let submittedAt: string | null | undefined;

  if (historyId?.trim()) {
    const { data: entry, error: historyError } = await supabaseAdmin
      .from("medical_examination_history")
      .select("*")
      .eq("id", historyId.trim())
      .eq("application_id", applicationId)
      .maybeSingle();

    if (historyError || !entry) {
      return { ok: false, status: 404, error: "History entry not found." };
    }

    const history = entry as MedicalExaminationHistoryEntry;
    rawSchema = history.form_schema;
    responses = history.form_responses ?? {};
    referral = history.referral_data ?? {};
    status = history.status;
    submittedAt = history.submitted_at;
  } else {
    const { data: exam, error: examError } = await supabaseAdmin
      .from("medical_examinations")
      .select("*")
      .eq("application_id", applicationId)
      .maybeSingle();

    if (examError || !exam) {
      return { ok: false, status: 404, error: "Medical examination not found." };
    }

    const examination = exam as MedicalExamination;
    if (examination.status !== "submitted") {
      return {
        ok: false,
        status: 400,
        error: "Medical examination has not been submitted yet.",
      };
    }

    rawSchema = examination.form_schema;
    responses = examination.form_responses ?? {};
    referral = examination.referral_data ?? {};
    status = examination.status;
    submittedAt = examination.submitted_at;
  }

  const schema = normalizeMedicalFormSchema(rawSchema);
  if (!schema) {
    return { ok: false, status: 500, error: "Medical form schema is invalid." };
  }

  const payload: MedicalExamPdfPayload = {
    schema,
    responses,
    referral,
    status,
    submittedAt,
  };

  const buffer = await renderMedicalExamPdf(payload);
  const filename = medicalExamPdfFilename(application.full_name);

  return { ok: true, buffer, filename, payload };
}
