import { recruitmentInterviewUrl } from "@/lib/appUrl";
import { getResendFromAddress, getReplyToEmail } from "@/lib/email/resendClient";

type SendResult = { sent: boolean; error?: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

async function sendViaResend(params: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  cc?: string[];
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
    cc: params.cc,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: getReplyToEmail(),
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

/** Panel member invite with link to the interview session in WillsOne */
export async function sendPanelInviteEmail(params: {
  memberName: string;
  memberEmail: string;
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  applicationId: string;
  interviewStartAt: string;
  location?: string;
}): Promise<SendResult> {
  const link = recruitmentInterviewUrl(params.applicationId);
  const when = formatDateTime(params.interviewStartAt);
  const locationLine = params.location
    ? `<p style="margin:0 0 12px;font-size:14px;"><strong>Location:</strong> ${escapeHtml(params.location)}</p>`
    : "";

  const subject = `Interview panel invite — ${params.roleTitle} (${params.referenceNumber})`;

  const text = [
    `Dear ${params.memberName},`,
    "",
    "You have been invited to serve on an interview panel at Wills Farms Ltd.",
    "",
    `Candidate: ${params.candidateName}`,
    `Role: ${params.roleTitle}`,
    `Reference: ${params.referenceNumber}`,
    `Interview start: ${when}`,
    params.location ? `Location: ${params.location}` : "",
    "",
    `Open the interview guide: ${link}`,
    "",
    "Please sign in to WillsOne to access the staged interview guide and evaluation sheet.",
    "",
    "Kind regards,",
    "Human Capital Team",
    "Wills Farms Ltd.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = emailShell(
    "Interview panel invitation",
    `
      <p style="margin:0 0 16px;font-size:15px;">Dear ${escapeHtml(params.memberName)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        You have been invited to serve on an interview panel for the following candidate:
      </p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:14px;color:#374151;">
          <p style="margin:0 0 8px;"><strong>Candidate:</strong> ${escapeHtml(params.candidateName)}</p>
          <p style="margin:0 0 8px;"><strong>Role:</strong> ${escapeHtml(params.roleTitle)}</p>
          <p style="margin:0 0 8px;"><strong>Reference:</strong> ${escapeHtml(params.referenceNumber)}</p>
          <p style="margin:0 0 8px;"><strong>Interview start:</strong> ${escapeHtml(when)}</p>
          ${locationLine}
        </td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;">
        Use the link below to open the staged interview guide in WillsOne (sign-in required):
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#991b1b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Open interview guide</a>
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Or copy this link: ${escapeHtml(link)}</p>
    `,
  );

  return sendViaResend({ to: params.memberEmail, subject, html, text });
}

/** Notify candidate (+ HR copy) of Stage 2 practical date */
export async function sendStage2ScheduleEmail(params: {
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  referenceNumber: string;
  scheduledAt: string;
  location?: string;
  stage2Duration: string;
}): Promise<SendResult> {
  const when = formatDateTime(params.scheduledAt);
  const hrEmail = getReplyToEmail();
  const locationLine = params.location
    ? `Location: ${params.location}`
    : "Location: to be confirmed";

  const subject = `Practical assessment scheduled — ${params.roleTitle} (${params.referenceNumber})`;

  const text = [
    `Dear ${params.candidateName.split(/\s+/)[0] || params.candidateName},`,
    "",
    "Thank you for progressing to the next stage of your application with Wills Farms Ltd.",
    "",
    `Role: ${params.roleTitle}`,
    `Reference: ${params.referenceNumber}`,
    "",
    "Your practical assessment (Stage 2) has been scheduled:",
    when,
    locationLine,
    `Expected duration: ${params.stage2Duration}`,
    "",
    "Please arrive on time and bring any documents requested by HR. If you need to reschedule, contact info@willsfarms.com quoting your reference number.",
    "",
    "Kind regards,",
    "Human Capital Team",
    "Wills Farms Ltd.",
  ].join("\n");

  const html = emailShell(
    "Practical assessment scheduled",
    `
      <p style="margin:0 0 16px;font-size:15px;">Dear ${escapeHtml(params.candidateName.split(/\s+/)[0] || params.candidateName)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        Thank you for progressing to the practical assessment stage of your application.
      </p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:14px;color:#374151;">
          <p style="margin:0 0 8px;"><strong>Role:</strong> ${escapeHtml(params.roleTitle)}</p>
          <p style="margin:0 0 8px;"><strong>Reference:</strong> ${escapeHtml(params.referenceNumber)}</p>
          <p style="margin:0 0 8px;"><strong>Practical date & time:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 8px;"><strong>${escapeHtml(locationLine)}</strong></p>
          <p style="margin:0;"><strong>Duration:</strong> ${escapeHtml(params.stage2Duration)}</p>
        </td></tr>
      </table>
      <p style="margin:0;font-size:14px;color:#374151;">
        If you need to reschedule, contact
        <a href="mailto:info@willsfarms.com" style="color:#991b1b;">info@willsfarms.com</a>
        and quote reference <strong>${escapeHtml(params.referenceNumber)}</strong>.
      </p>
    `,
  );

  return sendViaResend({
    to: params.candidateEmail,
    cc: [hrEmail],
    subject,
    html,
    text,
  });
}

export async function sendAllPanelInvites(params: {
  members: { name: string; email: string }[];
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  applicationId: string;
  interviewStartAt: string;
  location?: string;
}): Promise<{ sent: number; failed: string[] }> {
  const failed: string[] = [];
  let sent = 0;

  for (const member of params.members) {
    if (!member.name.trim() || !member.email.trim()) continue;
    const result = await sendPanelInviteEmail({
      memberName: member.name.trim(),
      memberEmail: member.email.trim(),
      candidateName: params.candidateName,
      roleTitle: params.roleTitle,
      referenceNumber: params.referenceNumber,
      applicationId: params.applicationId,
      interviewStartAt: params.interviewStartAt,
      location: params.location,
    });
    if (result.sent) sent++;
    else failed.push(`${member.email}: ${result.error ?? "send failed"}`);
  }

  return { sent, failed };
}
