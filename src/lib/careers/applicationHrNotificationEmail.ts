import { getResendFromAddress, getReplyToEmail } from "@/lib/email/resendClient";

const HR_INBOX = "info@willsfarms.com";

type HrNotificationParams = {
  fullName: string;
  email: string;
  phone: string;
  roleTitle: string;
  referenceNumber: string;
  submittedAt: string;
};

function formatSubmittedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildApplicationHrNotificationEmail(
  params: HrNotificationParams,
): { subject: string; html: string; text: string } {
  const { fullName, email, phone, roleTitle, referenceNumber, submittedAt } = params;
  const dateLabel = formatSubmittedDate(submittedAt);
  const subject = `New job application — ${roleTitle} (${referenceNumber})`;

  const text = [
    "Dear Human Capital Team,",
    "",
    "A new job application has been submitted via the Wills Farms careers portal.",
    "",
    `Position: ${roleTitle}`,
    `Applicant: ${fullName}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Reference number: ${referenceNumber}`,
    `Submitted: ${dateLabel}`,
    "",
    "Please review the application in WillsOne under Human Capital → Recruitment.",
    "",
    "Kind regards,",
    "Wills Farms Careers System",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#991b1b;padding:28px 32px;">
              <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#fecaca;">Wills Farms Ltd.</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">New job application</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;">Dear Human Capital Team,</p>
              <p style="margin:0 0 16px;font-size:15px;color:#374151;">
                A candidate has submitted a job application through the public careers portal. Details are below.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Position:</strong> ${escapeHtml(roleTitle)}</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Applicant:</strong> ${escapeHtml(fullName)}</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Email:</strong> ${escapeHtml(email)}</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Phone:</strong> ${escapeHtml(phone)}</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Reference:</strong> ${escapeHtml(referenceNumber)}</p>
                    <p style="margin:0;font-size:14px;color:#374151;"><strong>Submitted:</strong> ${escapeHtml(dateLabel)}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:15px;color:#374151;">
                Review this application in WillsOne under <strong>Human Capital → Recruitment → Applications</strong>.
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

export async function sendApplicationHrNotificationEmail(
  params: HrNotificationParams,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = getResendFromAddress("Wills Farms Careers");
  const { subject, html, text } = buildApplicationHrNotificationEmail(params);

  const { error } = await resend.emails.send({
    from,
    to: HR_INBOX,
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
