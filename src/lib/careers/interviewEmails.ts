import {
  recruitmentInterviewUrl,
  panelInterviewUrl,
  refereeReferenceUrl,
} from "@/lib/appUrl";
import {
  getResendFromAddress,
  getReplyToEmail,
} from "@/lib/email/resendClient";

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

type EmailAttachment = { filename: string; content: string };

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
    cc: params.cc,
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

/** Panel member invite with link to the public interview form (no login) */
export async function sendPanelInviteEmail(params: {
  memberName: string;
  memberEmail: string;
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  accessToken: string;
  stage: 1 | 2;
  interviewStartAt: string;
  location?: string;
}): Promise<SendResult> {
  const link = panelInterviewUrl(params.accessToken);
  const when = formatDateTime(params.interviewStartAt);
  const locationLine = params.location
    ? `<p style="margin:0 0 12px;font-size:14px;"><strong>Location:</strong> ${escapeHtml(params.location)}</p>`
    : "";

  const subject = `Interview panel invite (Stage ${params.stage}) — ${params.roleTitle} (${params.referenceNumber})`;

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
    `Open your Stage ${params.stage} interview form: ${link}`,
    "",
    "No WillsOne account is required — use the link above on any device.",
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
        Use the link below to open your Stage ${params.stage} interview evaluation form. No sign-in required:
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#991b1b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Open interview form</a>
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Or copy this link: ${escapeHtml(link)}</p>
    `,
  );

  return sendViaResend({ to: params.memberEmail, subject, html, text });
}

/** Thank candidate and confirm Stage 1 interview date/time */
export async function sendInterviewInvitationEmail(params: {
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  referenceNumber: string;
  interviewStartAt: string;
  location?: string;
}): Promise<SendResult> {
  const when = formatDateTime(params.interviewStartAt);
  const hrEmail = getReplyToEmail();
  const firstName =
    params.candidateName.trim().split(/\s+/)[0] || params.candidateName;
  const locationText = params.location?.trim()
    ? params.location.trim()
    : "To be confirmed";
  const locationHtml = params.location?.trim()
    ? `<p style="margin:0 0 8px;"><strong>Location:</strong> ${escapeHtml(params.location.trim())}</p>`
    : `<p style="margin:0 0 8px;"><strong>Location:</strong> To be confirmed</p>`;

  const subject = `Interview invitation — ${params.roleTitle} (${params.referenceNumber})`;

  const text = [
    `Dear ${firstName},`,
    "",
    "Thank you for your application to Wills Farms Ltd.",
    "",
    "Following our review, we would like to invite you to interview for the position below.",
    "",
    `Position applied for: ${params.roleTitle}`,
    `Reference number: ${params.referenceNumber}`,
    "",
    "Your interview has been scheduled as follows:",
    when,
    `Location: ${locationText}`,
    "",
    "Please arrive on time. If you need to reschedule or have any questions, contact info@willsfarms.com and quote your reference number.",
    "",
    "We look forward to meeting you.",
    "",
    "Kind regards,",
    "Human Capital Team",
    "Wills Farms Ltd.",
  ].join("\n");

  const html = emailShell(
    "Interview invitation",
    `
      <p style="margin:0 0 16px;font-size:15px;">Dear ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        Thank you for your application to <strong>Wills Farms Ltd.</strong>
        Following our review, we would like to invite you to interview for the position below.
      </p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:14px;color:#374151;">
          <p style="margin:0 0 8px;"><strong>Position applied for:</strong> ${escapeHtml(params.roleTitle)}</p>
          <p style="margin:0 0 8px;"><strong>Reference number:</strong> ${escapeHtml(params.referenceNumber)}</p>
          <p style="margin:0 0 8px;"><strong>Interview date & time:</strong> ${escapeHtml(when)}</p>
          ${locationHtml}
        </td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        Please arrive on time. If you need to reschedule or have any questions, contact
        <a href="mailto:info@willsfarms.com" style="color:#991b1b;">info@willsfarms.com</a>
        and quote reference <strong>${escapeHtml(params.referenceNumber)}</strong>.
      </p>
      <p style="margin:0;font-size:15px;color:#374151;">We look forward to meeting you.</p>
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

/** Notify candidate (+ HR copy) of Stage 2 practical date and time */
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
  const firstName =
    params.candidateName.trim().split(/\s+/)[0] || params.candidateName;
  const locationLine = params.location?.trim()
    ? params.location.trim()
    : "To be confirmed";

  const practicalExpectations = [
    "Arrive on time and dressed appropriately for the working environment.",
    "Comply with all biosecurity, PPE, and safety instructions given on arrival.",
    "Follow supervisor direction throughout — ask if anything is unclear before proceeding.",
    "Bring valid ID and any documents HR has requested.",
  ];

  const expectationsText = practicalExpectations
    .map((item, i) => `${i + 1}. ${item}`)
    .join("\n");

  const expectationsHtml = practicalExpectations
    .map(
      (item) =>
        `<li style="margin:0 0 8px;font-size:14px;color:#374151;">${escapeHtml(item)}</li>`,
    )
    .join("");

  const subject = `Practical assessment scheduled — ${params.roleTitle} (${params.referenceNumber})`;

  const text = [
    `Dear ${firstName},`,
    "",
    "Congratulations on progressing to the practical assessment stage of your application with Wills Farms Ltd.",
    "",
    `Role: ${params.roleTitle}`,
    `Reference: ${params.referenceNumber}`,
    "",
    "Your practical assessment has been scheduled:",
    when,
    `Location: ${locationLine}`,
    `Expected duration: ${params.stage2Duration}`,
    "",
    "What we expect from you on the day:",
    expectationsText,
    "",
    "If you need to reschedule, contact info@willsfarms.com quoting your reference number.",
    "",
    "Kind regards,",
    "Human Capital Team",
    "Wills Farms Ltd.",
  ].join("\n");

  const html = emailShell(
    "Practical assessment — next stage",
    `
      <p style="margin:0 0 16px;font-size:15px;">Dear ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        <strong>Congratulations</strong> on progressing to the practical assessment stage of your
        application with <strong>Wills Farms Ltd.</strong>
      </p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:14px;color:#374151;">
          <p style="margin:0 0 8px;"><strong>Role:</strong> ${escapeHtml(params.roleTitle)}</p>
          <p style="margin:0 0 8px;"><strong>Reference:</strong> ${escapeHtml(params.referenceNumber)}</p>
          <p style="margin:0 0 8px;"><strong>Practical date & time:</strong> ${escapeHtml(when)}</p>
          <p style="margin:0 0 8px;"><strong>Location:</strong> ${escapeHtml(locationLine)}</p>
          <p style="margin:0;"><strong>Duration:</strong> ${escapeHtml(params.stage2Duration)}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#374151;">What we expect from you on the day:</p>
      <ul style="margin:0 0 20px;padding-left:20px;">${expectationsHtml}</ul>
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
  members: {
    name: string;
    email: string;
    access_token: string;
    stage: 1 | 2;
  }[];
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
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
      accessToken: member.access_token,
      stage: member.stage,
      interviewStartAt: params.interviewStartAt,
      location: params.location,
    });
    if (result.sent) sent++;
    else failed.push(`${member.email}: ${result.error ?? "send failed"}`);
  }

  return { sent, failed };
}

/** Congratulations + onboarding magic link (7-day expiry noted in copy) */
export async function sendHireOnboardingEmail(params: {
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  referenceNumber: string;
  onboardingLink: string;
  expiresAt: string;
  recommendedStartDate?: string;
  offerLetter?: {
    secure_url: string;
    original_name?: string;
  };
}): Promise<SendResult> {
  const hrEmail = getReplyToEmail();
  const firstName =
    params.candidateName.trim().split(/\s+/)[0] || params.candidateName;
  const expiry = formatDateTime(params.expiresAt);
  const startLine = params.recommendedStartDate
    ? `<p style="margin:0 0 8px;"><strong>Proposed start date:</strong> ${escapeHtml(params.recommendedStartDate)}</p>`
    : "";

  const offerLetterFilename =
    params.offerLetter?.original_name?.trim() || "offer-letter.pdf";
  const attachment = params.offerLetter?.secure_url
    ? await fetchUrlAsBase64Attachment(
        params.offerLetter.secure_url,
        offerLetterFilename,
      )
    : null;

  const offerLetterText = attachment
    ? "Your signed offer letter is attached to this email."
    : "";
  const offerLetterHtml = attachment
    ? `<p style="margin:0 0 16px;font-size:15px;color:#374151;">Your signed offer letter is attached to this email.</p>`
    : "";

  const subject = `Congratulations — ${params.roleTitle} (${params.referenceNumber})`;

  const text = [
    `Dear ${firstName},`,
    "",
    "Congratulations — we are pleased to offer you employment with Wills Farms Ltd.",
    "",
    `Role: ${params.roleTitle}`,
    `Reference: ${params.referenceNumber}`,
    params.recommendedStartDate
      ? `Proposed start date: ${params.recommendedStartDate}`
      : "",
    "",
    offerLetterText,
    "",
    "Please complete your employee onboarding using the secure link below. This link is valid for 7 days:",
    params.onboardingLink,
    "",
    `Link expires: ${expiry}`,
    "",
    "The onboarding has three stages: personal information, medical & qualifications, and references & declarations. After submission, our HR team will contact you regarding medical examination and next steps.",
    "",
    "If you have questions, contact info@willsfarms.com quoting your reference number.",
    "",
    "Kind regards,",
    "Human Capital Team",
    "Wills Farms Ltd.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = emailShell(
    "Offer — complete onboarding",
    `
      <p style="margin:0 0 16px;font-size:15px;">Dear ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        <strong>Congratulations</strong> — we are pleased to offer you employment with
        <strong>Wills Farms Ltd.</strong>
      </p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:14px;color:#374151;">
          <p style="margin:0 0 8px;"><strong>Role:</strong> ${escapeHtml(params.roleTitle)}</p>
          <p style="margin:0 0 8px;"><strong>Reference:</strong> ${escapeHtml(params.referenceNumber)}</p>
          ${startLine}
        </td></tr>
      </table>
      ${offerLetterHtml}
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        Please complete your employee onboarding using the secure link below.
        The link is valid for <strong>7 days</strong> (expires ${escapeHtml(expiry)}).
      </p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(params.onboardingLink)}" style="display:inline-block;background:#991b1b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Complete onboarding</a>
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Or copy this link: ${escapeHtml(params.onboardingLink)}</p>
    `,
  );

  const result = await sendViaResend({
    to: params.candidateEmail,
    cc: [hrEmail],
    subject,
    html,
    text,
    attachments: attachment ? [attachment] : undefined,
  });

  if (result.sent && params.offerLetter?.secure_url && !attachment) {
    return {
      sent: true,
      error: "Email sent, but the offer letter could not be attached.",
    };
  }

  return result;
}

/** Professional rejection after panel decision */
export async function sendRejectionEmail(params: {
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  referenceNumber: string;
}): Promise<SendResult> {
  const hrEmail = getReplyToEmail();
  const firstName =
    params.candidateName.trim().split(/\s+/)[0] || params.candidateName;

  const subject = `Application update — ${params.roleTitle} (${params.referenceNumber})`;

  const text = [
    `Dear ${firstName},`,
    "",
    "Thank you for your interest in Wills Farms Ltd. and for taking part in our recruitment process.",
    "",
    `After careful consideration, we will not be proceeding with your application for ${params.roleTitle} at this time.`,
    "",
    `Reference: ${params.referenceNumber}`,
    "",
    "We appreciate the time you invested and wish you every success in your career.",
    "",
    "Kind regards,",
    "Human Capital Team",
    "Wills Farms Ltd.",
  ].join("\n");

  const html = emailShell(
    "Application update",
    `
      <p style="margin:0 0 16px;font-size:15px;">Dear ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        Thank you for your interest in <strong>Wills Farms Ltd.</strong> and for taking part in our recruitment process.
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        After careful consideration, we will not be proceeding with your application for
        <strong>${escapeHtml(params.roleTitle)}</strong> at this time.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">Reference: ${escapeHtml(params.referenceNumber)}</p>
      <p style="margin:0;font-size:15px;color:#374151;">
        We appreciate the time you invested and wish you every success in your career.
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

/** Notify HR when a candidate completes onboarding */
export async function sendOnboardingSubmittedEmail(params: {
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  applicationId: string;
}): Promise<SendResult> {
  const hrEmail = getReplyToEmail();
  const dashboardLink = `${recruitmentInterviewUrl(params.applicationId).split("?")[0]}?tab=onboarding`;

  const subject = `Onboarding submitted — ${params.candidateName} (${params.referenceNumber})`;

  const text = [
    "A candidate has completed employee onboarding.",
    "",
    `Candidate: ${params.candidateName}`,
    `Role: ${params.roleTitle}`,
    `Reference: ${params.referenceNumber}`,
    "",
    `Review in Recruitment → Onboarding: ${dashboardLink}`,
  ].join("\n");

  const html = emailShell(
    "Onboarding submitted",
    `
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        A candidate has completed employee onboarding.
      </p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:14px;color:#374151;">
          <p style="margin:0 0 8px;"><strong>Candidate:</strong> ${escapeHtml(params.candidateName)}</p>
          <p style="margin:0 0 8px;"><strong>Role:</strong> ${escapeHtml(params.roleTitle)}</p>
          <p style="margin:0;"><strong>Reference:</strong> ${escapeHtml(params.referenceNumber)}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(dashboardLink)}" style="display:inline-block;background:#991b1b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Open Recruitment — Onboarding</a>
      </p>
    `,
  );

  return sendViaResend({
    to: hrEmail,
    subject,
    html,
    text,
  });
}

/** Referee reference form invite — sent when candidate submits job application */
export async function sendRefereeReferenceInviteEmail(params: {
  refereeName: string;
  refereeEmail: string;
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  accessToken: string;
  expiresAt: string;
}): Promise<SendResult> {
  const link = refereeReferenceUrl(params.accessToken);
  const expiryDate = new Date(params.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const subject = `Reference request — ${params.candidateName} (${params.referenceNumber})`;

  const text = [
    `Dear ${params.refereeName},`,
    "",
    `${params.candidateName} has listed you as a referee for their application to Wills Farms Ltd.`,
    "",
    `Role applied for: ${params.roleTitle}`,
    `Application reference: ${params.referenceNumber}`,
    "",
    "Please complete the confidential reference form using the link below:",
    link,
    "",
    `This link expires on ${expiryDate}.`,
    "",
    "Your responses are confidential and processed under the Data Protection Act, 2012 (Act 843).",
    "",
    "Kind regards,",
    "Human Capital Team",
    "Wills Farms Ltd.",
  ].join("\n");

  const html = emailShell(
    "Referee reference request",
    `
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        Dear ${escapeHtml(params.refereeName)},
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">
        <strong>${escapeHtml(params.candidateName)}</strong> has listed you as a referee for their
        application to Wills Farms Ltd.
      </p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:18px 22px;font-size:14px;color:#374151;">
          <p style="margin:0 0 8px;"><strong>Role applied for:</strong> ${escapeHtml(params.roleTitle)}</p>
          <p style="margin:0;"><strong>Application reference:</strong> ${escapeHtml(params.referenceNumber)}</p>
        </td></tr>
      </table>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#991b1b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Complete reference form</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
        Link expires ${escapeHtml(expiryDate)}. No account is required.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">
        Your responses are confidential and processed under the Data Protection Act, 2012 (Act 843).
      </p>
    `,
  );

  return sendViaResend({
    to: params.refereeEmail,
    subject,
    html,
    text,
  });
}
