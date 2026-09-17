import { medicalExaminationUrl } from "@/lib/appUrl";
import { getResendFromAddress, getReplyToEmail } from "@/lib/email/resendClient";
import {
  emailDetailsBox,
  emailPrimaryButton,
  escapeHtmlForEmail,
  plainTextToEmailBodyHtml,
  willsFarmsEmailShell,
} from "@/lib/email/willsFarmsEmailShell";
import type { MedicalReferralData } from "./medicalFormSchema";

const EMAIL_TITLE = "Occupational medical examination";

export async function sendMedicalExaminationEmail(params: {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  cc?: string[];
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = getResendFromAddress("Wills Farms HR");

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    cc: params.cc,
    subject: params.subject,
    html: params.bodyHtml,
    text: params.bodyText,
    replyTo: getReplyToEmail(),
  });

  if (error) {
    return { sent: false, error: error.message };
  }
  return { sent: true };
}

/** Wrap plain-text (e.g. Intel draft) in the standard Wills Farms email shell. */
export function buildMedicalExamEmailFromPlainText(params: {
  bodyText: string;
  formUrl?: string | null;
}): { bodyText: string; bodyHtml: string } {
  const { bodyText, formUrl } = params;
  let inner = plainTextToEmailBodyHtml(bodyText);

  if (formUrl?.trim()) {
    inner += emailPrimaryButton("Open examination form", formUrl.trim());
  }

  return {
    bodyText,
    bodyHtml: willsFarmsEmailShell(EMAIL_TITLE, inner),
  };
}

export function buildMedicalExamEmailFallback(params: {
  referral: MedicalReferralData;
  formUrl: string;
  hrContactName?: string | null;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const { referral, formUrl, hrContactName } = params;
  const name = referral.full_name ?? "the candidate";
  const ref = referral.reference_number ? ` (Ref: ${referral.reference_number})` : "";
  const facility = referral.designated_facility?.trim();
  const appointment = referral.appointment_date?.trim();
  const examType = referral.examination_type ?? "Pre-employment";
  const category = referral.job_category?.trim() || null;

  const subject = `Occupational medical examination — ${name}${ref}`;

  const lines = [
    "Dear Colleague,",
    "",
    `Wills Farms Ltd. requests an occupational medical examination for ${name}${ref}, in connection with a ${examType.toLowerCase()} assessment.`,
    "",
    "Referral summary:",
    `- Candidate: ${name}`,
    referral.reference_number ? `- Job reference: ${referral.reference_number}` : null,
    referral.position_offered ? `- Position offered: ${referral.position_offered}` : null,
    referral.department_site ? `- Department / site: ${referral.department_site}` : null,
    category ? `- Job category: ${category}` : null,
    facility ? `- Designated facility: ${facility}` : null,
    appointment ? `- Appointment date: ${appointment}` : null,
    "",
    "Please complete the secure examination form using the link below. Parts 2–6 are completed at your facility. " +
      "On submission, please ensure results are communicated directly to Wills Farms HR — not through the employee.",
    "",
    formUrl,
    "",
    hrContactName
      ? `Kind regards,\n${hrContactName}\nHuman Resources\nWills Farms Ltd.`
      : "Kind regards,\nHuman Resources\nWills Farms Ltd.",
  ].filter(Boolean);

  const bodyText = lines.join("\n");

  const inner = [
    `<p style="margin:0 0 16px;font-size:15px;color:#374151;">Dear Colleague,</p>`,
    `<p style="margin:0 0 16px;font-size:15px;color:#374151;">Wills Farms Ltd. requests an occupational medical examination for <strong>${escapeHtmlForEmail(name)}</strong>${escapeHtmlForEmail(ref)}, in connection with a ${escapeHtmlForEmail(examType.toLowerCase())} assessment.</p>`,
    emailDetailsBox("Referral summary", [
      ["Candidate", name],
      ["Job reference", referral.reference_number],
      ["Position offered", referral.position_offered],
      ["Department / site", referral.department_site],
      ["Job category", category],
      ["Designated facility", facility],
      ["Appointment date", appointment],
      ["Examination type", examType],
    ]),
    `<p style="margin:0 0 16px;font-size:15px;color:#374151;">Please complete the secure examination form using the button below. Parts 2–6 are completed at your facility. On submission, communicate results directly to Wills Farms HR — not through the employee.</p>`,
    emailPrimaryButton("Open examination form", formUrl),
    `<p style="margin:24px 0 0;font-size:15px;color:#374151;">Kind regards,<br/><strong>${escapeHtmlForEmail(hrContactName ?? "Human Resources")}</strong><br/>Wills Farms Ltd.</p>`,
  ].join("");

  return { subject, bodyText, bodyHtml: willsFarmsEmailShell(EMAIL_TITLE, inner) };
}

export function buildMedicalExamSubmittedEmailHtml(params: {
  candidateName: string;
  referenceNumber?: string | null;
}): string {
  const ref = params.referenceNumber ? ` (${params.referenceNumber})` : "";
  const inner = [
    `<p style="margin:0 0 16px;font-size:15px;color:#374151;">The occupational medical examination for <strong>${escapeHtmlForEmail(params.candidateName)}</strong>${escapeHtmlForEmail(ref)} has been submitted by the facility.</p>`,
    `<p style="margin:0;font-size:15px;color:#374151;">Review it in <strong>Recruitment → Onboarding</strong>.</p>`,
  ].join("");
  return willsFarmsEmailShell("Medical examination submitted", inner);
}

export function medicalExamFormUrl(token: string): string {
  return medicalExaminationUrl(token);
}
