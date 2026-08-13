import type { SendResult } from "@/lib/email/types";

// The one place every "who does this email come from / go to by default"
// value lives — every Resend-sending file in the app (careers, appraisal,
// Task Manager) reads from here now instead of keeping its own hand-typed
// copy of the same fallback strings, which is what let them drift (e.g.
// Task Manager and careers each independently duplicating the sandbox
// address, and one auth flow ending up with a weaker app-URL fallback than
// everywhere else). See src/lib/appUrl.ts for the app base URL, which this
// module intentionally does NOT duplicate.

const DEFAULT_SENDING_ADDRESS = "onboarding@resend.dev";

/**
 * The raw sending address on its own (no display name) — for the one
 * caller (the lead-capture form) that needs to build its own "Visitor Name
 * <address>" from combo rather than a fixed label.
 */
export function getResendSendingAddress(): string {
  const configured = process.env.RESEND_FROM_EMAIL;
  if (!configured) return DEFAULT_SENDING_ADDRESS;
  const match = configured.match(/<([^>]+)>/);
  return match ? match[1] : configured;
}

export function getResendFromAddress(fallbackLabel = "Wills Farms"): string {
  return (
    process.env.RESEND_FROM_EMAIL ?? `${fallbackLabel} <${DEFAULT_SENDING_ADDRESS}>`
  );
}

/** Where a recipient's reply actually lands when they hit "Reply" — same value every sender should use. */
export function getReplyToEmail(): string {
  return process.env.CAREERS_REPLY_TO_EMAIL ?? "info@willsfarms.com";
}

export async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: params.from ?? getResendFromAddress(),
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: getReplyToEmail(),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error sending email";
    return { sent: false, error: message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPasswordResetEmail(actionLink: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Reset your Wills Farms password";
  const text = [
    "You requested a password reset for your Wills Farms staff account.",
    "",
    "Open this link to choose a new password:",
    actionLink,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    "Wills Farms",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#991b1b;padding:24px 28px;">
          <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#fecaca;">Wills Farms</p>
          <h1 style="margin:8px 0 0;font-size:20px;color:#fff;">Password reset</h1>
        </td></tr>
        <tr><td style="padding:28px;color:#374151;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">You requested a password reset for your staff account.</p>
          <p style="margin:0 0 24px;">Click the button below to set a new password. This link expires after a short time.</p>
          <a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#C62828;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Reset password</a>
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">If you did not request this, you can safely ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

export function buildInviteEmail(actionLink: string, firstName: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "You're invited to Wills Farms staff portal";
  const greeting = firstName.trim() || "there";
  const text = [
    `Hello ${greeting},`,
    "",
    "You have been invited to the Wills Farms management portal.",
    "",
    "Open this link to set your password and activate your account:",
    actionLink,
    "",
    "Wills Farms",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#991b1b;padding:24px 28px;">
          <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#fecaca;">Wills Farms</p>
          <h1 style="margin:8px 0 0;font-size:20px;color:#fff;">Welcome to the team</h1>
        </td></tr>
        <tr><td style="padding:28px;color:#374151;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">Hello ${escapeHtml(greeting)},</p>
          <p style="margin:0 0 24px;">You have been invited to the Wills Farms staff portal. Set your password to get started.</p>
          <a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#C62828;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Set your password</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
