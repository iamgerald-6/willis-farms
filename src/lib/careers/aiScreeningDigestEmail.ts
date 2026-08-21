import { getResendFromAddress, getReplyToEmail } from "@/lib/email/resendClient";
import { recruitmentApplicationsUrl, recruitmentAiRejectsUrl } from "@/lib/appUrl";

const HR_INBOX = "info@willsfarms.com";

type DigestParams = {
  dateLabel: string;
  total: number;
  shortlisted: number;
  underReview: number;
  stillPending: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildAiScreeningDigestEmail(
  params: DigestParams,
): { subject: string; html: string; text: string } {
  const { dateLabel, total, shortlisted, underReview, stillPending } = params;
  const applicationsUrl = recruitmentApplicationsUrl();
  const aiRejectsUrl = recruitmentAiRejectsUrl();
  const subject = `Careers — ${dateLabel}: ${total} application${total === 1 ? "" : "s"}, ${shortlisted} shortlisted`;

  const pendingLine =
    stillPending > 0
      ? `${stillPending} ${stillPending === 1 ? "is" : "are"} still waiting to be graded and will show up once that finishes.`
      : "";

  const text = [
    "Dear Human Capital Team,",
    "",
    `Here's yesterday's careers portal summary (${dateLabel}):`,
    "",
    `Total applications: ${total}`,
    `Shortlisted by AI: ${shortlisted}`,
    `Sent to Rejects for review: ${underReview}`,
    pendingLine,
    "",
    `Applications: ${applicationsUrl}`,
    `Rejects (needs your review): ${aiRejectsUrl}`,
    "",
    "Kind regards,",
    "Wills Farms Careers System",
  ]
    .filter(Boolean)
    .join("\n");

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
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Careers — daily summary</h1>
              <p style="margin:6px 0 0;font-size:14px;color:#fecaca;">${escapeHtml(dateLabel)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;">Dear Human Capital Team,</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;">
                <tr>
                  <td width="33%" style="padding:16px;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;text-align:center;">
                    <p style="margin:0;font-size:26px;font-weight:700;color:#1f2937;">${total}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Total applications</p>
                  </td>
                  <td width="4"></td>
                  <td width="33%" style="padding:16px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;text-align:center;">
                    <p style="margin:0;font-size:26px;font-weight:700;color:#7e22ce;">${shortlisted}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#7e22ce;">Shortlisted</p>
                  </td>
                  <td width="4"></td>
                  <td width="33%" style="padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;text-align:center;">
                    <p style="margin:0;font-size:26px;font-weight:700;color:#b45309;">${underReview}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#b45309;">Needs your review</p>
                  </td>
                </tr>
              </table>
              ${pendingLine ? `<p style="margin:0 0 20px;font-size:13px;color:#9ca3af;">${escapeHtml(pendingLine)}</p>` : ""}
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right:10px;">
                    <a href="${applicationsUrl}" style="display:inline-block;background:#991b1b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">View Applications</a>
                  </td>
                  <td>
                    <a href="${aiRejectsUrl}" style="display:inline-block;background:#ffffff;color:#991b1b;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;border:1px solid #991b1b;">View Rejects</a>
                  </td>
                </tr>
              </table>
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

export async function sendAiScreeningDigestEmail(
  params: DigestParams,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = getResendFromAddress("Wills Farms Careers");
  const { subject, html, text } = buildAiScreeningDigestEmail(params);

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
