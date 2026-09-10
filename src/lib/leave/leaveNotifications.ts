/**
 * Emails for the two-stage leave approval workflow (see
 * docs/leave/two-stage-approval.sql and leaveAccess.ts). There's no in-app
 * notification inbox anywhere in this app yet — every other approval flow
 * (Task Manager, careers/onboarding) notifies by email via Resend, so this
 * follows the same pattern rather than introducing a new mechanism.
 *
 * Two emails:
 *  - Stage 1 fires once, when the request is created: to the applicant's
 *    supervisor, or straight to the stage-2 recipients below if the
 *    applicant has no supervisor assigned.
 *  - Stage 2 fires once, when the supervisor approves (or immediately, for
 *    the no-supervisor case above): to every Human Resource user, or every
 *    Executive Role user only if the applicant is themselves Human Resource
 *    or Executive Role (see canApproveLeaveSignoffStage).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendViaResend } from "@/lib/email/resendClient";
import { getAppBaseUrl } from "@/lib/appUrl";
import {
  fetchUserRoleLabelMap,
  isExecutiveRoleLabel,
  isHumanResourceRoleLabel,
} from "@/lib/userRoleAccessControl";

type LeaveRequestSummary = {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
};

type Recipient = { email: string; name: string };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function leaveDashboardUrl(): string {
  return `${getAppBaseUrl()}/dashboard/humanCapital/leave`;
}

function buildLeaveNotificationEmail(params: {
  heading: string;
  intro: string;
  request: LeaveRequestSummary;
}): { subject: string; html: string; text: string } {
  const { heading, intro, request } = params;
  const subject = `${heading} — ${request.employeeName}`;

  const text = [
    intro,
    "",
    `Employee: ${request.employeeName}`,
    `Leave type: ${request.leaveType}`,
    `From: ${formatDate(request.startDate)}`,
    `To: ${formatDate(request.endDate)}`,
    `Total days: ${request.totalDays}`,
    request.reason ? `Reason: ${request.reason}` : "",
    "",
    `Review it here: ${leaveDashboardUrl()}`,
    "",
    "Wills Farms",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#991b1b;padding:24px 28px;">
          <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#fecaca;">Wills Farms</p>
          <h1 style="margin:8px 0 0;font-size:20px;color:#fff;">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:28px;color:#374151;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
            <tr><td style="padding:18px 20px;font-size:14px;">
              <p style="margin:0 0 8px;"><strong>Employee:</strong> ${escapeHtml(request.employeeName)}</p>
              <p style="margin:0 0 8px;"><strong>Leave type:</strong> ${escapeHtml(request.leaveType)}</p>
              <p style="margin:0 0 8px;"><strong>From:</strong> ${escapeHtml(formatDate(request.startDate))}</p>
              <p style="margin:0 0 8px;"><strong>To:</strong> ${escapeHtml(formatDate(request.endDate))}</p>
              <p style="margin:0${request.reason ? " 0 8px" : ""};"><strong>Total days:</strong> ${request.totalDays}</p>
              ${request.reason ? `<p style="margin:0;"><strong>Reason:</strong> ${escapeHtml(request.reason)}</p>` : ""}
            </td></tr>
          </table>
          <a href="${leaveDashboardUrl()}" style="display:inline-block;background:#C62828;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Review request</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

/** Fired once, when the request is first submitted and lands on the
 * supervisor's desk (stage 1). */
export async function sendLeaveSupervisorNotification(
  supervisor: Recipient,
  request: LeaveRequestSummary,
): Promise<void> {
  const { subject, html, text } = buildLeaveNotificationEmail({
    heading: "Leave request awaiting your approval",
    intro: `${request.employeeName} has submitted a leave request and it needs your approval as their supervisor.`,
    request,
  });
  await sendViaResend({ to: supervisor.email, subject, html, text });
}

/** Fired once the supervisor approves (stage 1 → stage 2), or immediately on
 * submission when the applicant has no supervisor assigned. Goes to every
 * Human Resource user, or every Executive Role user only, when the
 * applicant is themselves Human Resource or Executive Role — see
 * canApproveLeaveSignoffStage in leaveAccess.ts. */
export async function sendLeaveSignoffNotification(
  recipients: Recipient[],
  request: LeaveRequestSummary,
): Promise<void> {
  if (recipients.length === 0) return;
  const { subject, html, text } = buildLeaveNotificationEmail({
    heading: "Leave request awaiting sign-off",
    intro: `${request.employeeName}'s leave request has cleared supervisor approval and needs final sign-off.`,
    request,
  });
  await Promise.all(
    recipients.map((r) => sendViaResend({ to: r.email, subject, html, text })),
  );
}

/** Resolves who should receive the stage-2 sign-off email: every Human
 * Resource user, unless the applicant is themselves Human Resource or
 * Executive Role, in which case only Executive Role users (mirrors
 * canApproveLeaveSignoffStage exactly). */
export async function resolveSignoffRecipients(
  supabaseAdmin: SupabaseClient,
  applicantRoleLabel: string | null | undefined,
): Promise<Recipient[]> {
  const roleMap = await fetchUserRoleLabelMap(supabaseAdmin);
  if (roleMap.size === 0) return [];

  const applicantIsHrOrExecutive =
    isHumanResourceRoleLabel(applicantRoleLabel) ||
    isExecutiveRoleLabel(applicantRoleLabel);

  const matchingRoleIds = [...roleMap.entries()]
    .filter(([, label]) =>
      applicantIsHrOrExecutive
        ? isExecutiveRoleLabel(label)
        : isHumanResourceRoleLabel(label) || isExecutiveRoleLabel(label),
    )
    .map(([id]) => id);

  if (matchingRoleIds.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("users")
    .select("email, first_name, last_name")
    .in("user_role_id", matchingRoleIds);

  return (data ?? [])
    .filter((u): u is { email: string; first_name: string | null; last_name: string | null } => !!u.email)
    .map((u) => ({
      email: u.email,
      name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
    }));
}
