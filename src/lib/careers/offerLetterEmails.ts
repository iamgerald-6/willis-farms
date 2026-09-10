import {
  loginWithRedirectUrl,
  recruitmentOfferLetterUrl,
} from "@/lib/appUrl";
import {
  getResendFromAddress,
  getReplyToEmail,
} from "@/lib/email/resendClient";

type SendResult = { sent: boolean; error?: string };

type EmailAttachment = { filename: string; content: string; contentType?: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchUrlAsBase64Attachment(
  url: string,
  filename: string,
): Promise<EmailAttachment | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { filename, content: buffer.toString("base64") };
  } catch {
    return null;
  }
}

async function sendViaResend(params: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  cc?: string[];
  attachments?: EmailAttachment[];
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = getResendFromAddress("Wills Farms Careers");

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    cc: params.cc?.length ? params.cc : undefined,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: getReplyToEmail(),
    attachments: params.attachments,
  });

  if (error) return { sent: false, error: error.message };
  return { sent: true };
}

function emailShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#991b1b;padding:24px 28px;">
          <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#fecaca;">Wills Farms Ltd.</p>
          <h1 style="margin:8px 0 0;font-size:20px;color:#fff;">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td style="padding:28px;">${body}</td></tr>
        <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Human Capital · Wills Farms Ltd.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function formatPerson(name: string, title?: string | null): string {
  const trimmedTitle = title?.trim();
  return trimmedTitle ? `${name} (${trimmedTitle})` : name;
}

/** Sent to the designated signer when HR is preparing the letter on their behalf. */
export async function sendOfferLetterApprovalRequestEmail(params: {
  signerEmail: string;
  signerName: string;
  signerTitle?: string | null;
  submittedByName: string;
  submittedByTitle?: string | null;
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  applicationId: string;
  pdfUrl: string;
  pdfFilename: string;
  ccEmails?: string[];
}): Promise<SendResult> {
  const offerPath = `/dashboard/humanCapital/recruitment?tab=offer&offer=${params.applicationId}`;
  const loginUrl = loginWithRedirectUrl(offerPath);
  const directUrl = recruitmentOfferLetterUrl(params.applicationId);
  const submitter = formatPerson(params.submittedByName, params.submittedByTitle);

  const subject = `Offer letter for your approval — ${params.candidateName} (${params.referenceNumber})`;

  const text = [
    `${submitter} has prepared an offer letter for you to review and sign.`,
    "",
    `Candidate: ${params.candidateName}`,
    `Position: ${params.roleTitle}`,
    `Reference: ${params.referenceNumber}`,
    "",
    "The offer letter PDF is attached. Sign in to WillsOne to review, update the sign-off if needed, and save the final PDF.",
    "",
    `Sign in: ${loginUrl}`,
    `Direct link (after sign-in): ${directUrl}`,
  ].join("\n");

  const html = emailShell(
    "Offer letter awaiting your approval",
    `
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        <strong>${escapeHtml(submitter)}</strong> has prepared an offer letter for you to
        <strong>review and sign</strong>.
      </p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:14px;color:#374151;">
          <p style="margin:0 0 8px;"><strong>Candidate:</strong> ${escapeHtml(params.candidateName)}</p>
          <p style="margin:0 0 8px;"><strong>Position:</strong> ${escapeHtml(params.roleTitle)}</p>
          <p style="margin:0;"><strong>Reference:</strong> ${escapeHtml(params.referenceNumber)}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">
        The offer letter PDF is attached. Sign in to WillsOne to review the letter and complete the sign-off.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#991b1b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Sign in to review offer letter</a>
      </p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">After signing in, open Recruitment → Offer if you are not taken there automatically.</p>
    `,
  );

  const attachment = await fetchUrlAsBase64Attachment(params.pdfUrl, params.pdfFilename);

  return sendViaResend({
    to: params.signerEmail,
    cc: params.ccEmails,
    subject,
    html,
    text,
    attachments: attachment ? [attachment] : undefined,
  });
}

/** Awareness copy for executives / HR — offer letter submitted, PDF attached. */
export async function sendOfferLetterSubmittedNoticeEmail(params: {
  recipientEmails: string[];
  submittedByName: string;
  submittedByTitle?: string | null;
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  applicationId: string;
  pdfUrl: string;
  pdfFilename: string;
}): Promise<SendResult> {
  if (!params.recipientEmails.length) {
    return { sent: false, error: "No notice recipients selected." };
  }

  const dashboardLink = recruitmentOfferLetterUrl(params.applicationId);
  const submitter = formatPerson(params.submittedByName, params.submittedByTitle);

  const subject = `Offer letter submitted — ${params.candidateName} for ${params.roleTitle}`;

  const text = [
    `${submitter} has submitted an offer letter.`,
    "",
    `Candidate: ${params.candidateName}`,
    `Position: ${params.roleTitle}`,
    `Reference: ${params.referenceNumber}`,
    "",
    "The offer letter PDF is attached for your records.",
    "",
    `View in Recruitment: ${dashboardLink}`,
  ].join("\n");

  const html = emailShell(
    "Offer letter submitted",
    `
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        <strong>${escapeHtml(submitter)}</strong> has submitted an offer letter.
      </p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:14px;color:#374151;">
          <p style="margin:0 0 8px;"><strong>Candidate:</strong> ${escapeHtml(params.candidateName)}</p>
          <p style="margin:0 0 8px;"><strong>Position:</strong> ${escapeHtml(params.roleTitle)}</p>
          <p style="margin:0;"><strong>Reference:</strong> ${escapeHtml(params.referenceNumber)}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">
        The offer letter PDF is attached for your awareness.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(dashboardLink)}" style="display:inline-block;background:#991b1b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Open in Recruitment</a>
      </p>
    `,
  );

  const attachment = await fetchUrlAsBase64Attachment(params.pdfUrl, params.pdfFilename);

  return sendViaResend({
    to: params.recipientEmails,
    subject,
    html,
    text,
    attachments: attachment ? [attachment] : undefined,
  });
}
