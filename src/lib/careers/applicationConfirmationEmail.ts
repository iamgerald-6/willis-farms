import { getResendFromAddress, getReplyToEmail } from "@/lib/email/resendClient";

type ApplicationConfirmationParams = {
  fullName: string;
  email: string;
  roleTitle: string;
  referenceNumber: string;
  submittedAt: string;
};

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function formatSubmittedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildApplicationConfirmationEmail(
  params: ApplicationConfirmationParams,
): { subject: string; html: string; text: string } {
  const {
    fullName,
    roleTitle,
    referenceNumber,
    submittedAt,
  } = params;
  const greeting = firstName(fullName);
  const dateLabel = formatSubmittedDate(submittedAt);

  const subject = `Application received — ${roleTitle} (${referenceNumber})`;

  const text = [
    `Dear ${greeting},`,
    "",
    "Thank you for applying to Wills Farms Ltd.",
    "",
    `We have received your application for: ${roleTitle}`,
    `Reference number: ${referenceNumber}`,
    `Date submitted: ${dateLabel}`,
    "",
    "Our Human Capital team will review your application. If your profile matches our current requirements, we will contact you by email or phone to discuss next steps.",
    "",
    "Please keep your reference number for any follow-up correspondence:",
    referenceNumber,
    "",
    "For enquiries, contact info@willsfarms.com and quote your reference number.",
    "",
    "Kind regards,",
    "Human Capital Team",
    "Wills Farms Ltd.",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#991b1b;padding:28px 32px;">
              <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#fecaca;">Wills Farms Ltd.</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Application received</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;">Dear ${escapeHtml(greeting)},</p>
              <p style="margin:0 0 16px;font-size:15px;color:#374151;">
                Thank you for your interest in joining <strong>Wills Farms Ltd.</strong> We confirm that we have successfully received your job application.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">Application details</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Position:</strong> ${escapeHtml(roleTitle)}</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Date submitted:</strong> ${escapeHtml(dateLabel)}</p>
                    <p style="margin:16px 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">Your reference number</p>
                    <p style="margin:0;font-size:24px;font-weight:700;letter-spacing:0.04em;color:#991b1b;">${escapeHtml(referenceNumber)}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px;font-size:15px;color:#374151;">
                Our Human Capital team will review your application against the role requirements. If you are shortlisted, we will contact you directly to arrange the next stage of the recruitment process.
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#374151;">
                Please retain this email and quote your reference number in any follow-up correspondence.
              </p>

              <p style="margin:0 0 8px;font-size:14px;color:#374151;">
                Enquiries: <a href="mailto:info@willsfarms.com" style="color:#991b1b;text-decoration:none;font-weight:600;">info@willsfarms.com</a>
              </p>

              <p style="margin:24px 0 0;font-size:15px;color:#374151;">
                Kind regards,<br />
                <strong>Human Capital Team</strong><br />
                Wills Farms Ltd.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                This is an automated confirmation. Please do not reply to this message unless instructed.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendApplicationConfirmationEmail(
  params: ApplicationConfirmationParams,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const from = getResendFromAddress("Wills Farms Careers");

  const { subject, html, text } = buildApplicationConfirmationEmail(params);

  const { error } = await resend.emails.send({
    from,
    to: params.email,
    subject,
    html,
    text,
    replyTo: getReplyToEmail(),
  });

  if (error) {
    return { sent: false, error: error.message };
  }

  return { sent: true };
}
