import type { Quarter } from "./sections";
import { graceDaysAfterQuarterEnd } from "./deadlines";
import { getAppBaseUrl } from "@/lib/appUrl";
import { getResendFromAddress, getReplyToEmail } from "@/lib/email/resendClient";

/**
 * Transactional emails for the Appraisal System, sent via Resend (same
 * provider/pattern already used for Careers confirmation emails). If
 * RESEND_API_KEY isn't configured, every sender here no-ops and returns
 * { sent: false } — callers should log a warning but never fail the
 * underlying request because of it.
 */

type SendResult = { sent: boolean; error?: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDeadline(deadlineAt: string | Date): string {
  const d = typeof deadlineAt === "string" ? new Date(deadlineAt) : deadlineAt;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const from = getResendFromAddress("Wills Farms HR");
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: getReplyToEmail(),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error sending email";
    return { sent: false, error: message };
  }
}

/** Log supervisor-notify outcomes (best-effort email — never fails the request). */
export function logSupervisorEvaluationEmail(
  context: string,
  result: SendResult,
  details: {
    supervisorEmail: string;
    employeeName: string;
    appraisalId?: string | number | null;
    quarter: string;
    year: number;
  },
): void {
  if (result.sent) {
    console.info(`[${context}] Supervisor evaluation email sent`, details);
    return;
  }

  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  console.warn(`[${context}] Supervisor evaluation email not sent`, {
    ...details,
    error: result.error,
    resendConfigured,
    fromAddress: resendConfigured ? getResendFromAddress("Wills Farms HR") : null,
    hint: !resendConfigured
      ? "Set RESEND_API_KEY in env."
      : "On Resend sandbox, only the account signup email receives mail until a domain is verified (RESEND_FROM_EMAIL).",
  });
}

function wrapEmail(title: string, bodyHtml: string): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
    <div style="background:#1e3a5f; padding: 20px 24px; border-radius: 12px 12px 0 0;">
      <h1 style="color:#fff; font-size: 18px; margin:0;">Wills Farms — Performance Appraisal</h1>
    </div>
    <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
      <h2 style="font-size:16px; margin: 0 0 12px;">${escapeHtml(title)}</h2>
      ${bodyHtml}
      <p style="color:#9ca3af; font-size:12px; margin-top: 24px;">
        This is an automated notification from the Wills Farms HR system.
      </p>
    </div>
  </div>`;
}

// ── 1. Appraisal window opened (notice to employee) ──────────────────────
export async function sendAppraisalOpenNotice(params: {
  employeeEmail: string;
  employeeName: string;
  quarter: Quarter;
  year: number;
  deadlineAt: string | Date;
}): Promise<SendResult> {
  const { employeeEmail, employeeName, quarter, year, deadlineAt } = params;
  const label = quarter === "Q4" ? `${quarter} (Annual) ${year}` : `${quarter} ${year}`;
  const graceDays = graceDaysAfterQuarterEnd(quarter);
  const html = wrapEmail(
    `Your ${label} appraisal is now open`,
    `<p>Hi ${escapeHtml(employeeName)},</p>
     <p>Your <strong>${escapeHtml(label)}</strong> performance appraisal is now open. Please complete your self-assessment.</p>
     <p><strong>Must be completed by: ${formatDeadline(deadlineAt)}</strong> (${graceDays} days after the quarter ends).</p>
     <p>If it isn't completed by both you and your supervisor by the deadline, it will automatically lock.</p>`,
  );
  const text = `Hi ${employeeName}, your ${label} appraisal is now open. Please complete your self-assessment by ${formatDeadline(deadlineAt)}.`;
  return sendViaResend({ to: employeeEmail, subject: `Appraisal open — ${label}`, html, text });
}

// ── 2. Reminder (to whichever party has a pending action) ────────────────
export async function sendAppraisalReminder(params: {
  toEmail: string;
  toName: string;
  audience: "employee" | "supervisor";
  quarter: Quarter;
  year: number;
  daysLeft: number;
  deadlineAt: string | Date;
  employeeName: string;
}): Promise<SendResult> {
  const { toEmail, toName, audience, quarter, year, daysLeft, deadlineAt, employeeName } = params;
  const label = quarter === "Q4" ? `${quarter} (Annual) ${year}` : `${quarter} ${year}`;
  const action =
    audience === "employee"
      ? "complete your self-assessment"
      : `complete your supervisor evaluation for ${employeeName}'s appraisal`;
  const html = wrapEmail(
    `Reminder: ${daysLeft} day${daysLeft === 1 ? "" : "s"} until quarter end`,
    `<p>Hi ${escapeHtml(toName)},</p>
     <p>This is a reminder that you still need to ${escapeHtml(action)} for <strong>${escapeHtml(label)}</strong>.</p>
     <p>The quarter ends in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong>. The appraisal locks on <strong>${formatDeadline(deadlineAt)}</strong>.</p>
     ${
       audience === "supervisor"
         ? `<p>If your evaluation isn't completed by the lock date, the appraisal will lock and a 10-point deduction will apply to your own appraisal score unless a justification is submitted and approved.</p>`
         : `<p>Please complete your self-assessment before the quarter ends to allow time for your supervisor's review.</p>`
     }`,
  );
  const text = `Reminder: ${daysLeft} day(s) until quarter end for ${label}. Locks ${formatDeadline(deadlineAt)}.`;
  return sendViaResend({
    to: toEmail,
    subject: `Reminder — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left: ${label} appraisal`,
    html,
    text,
  });
}

// ── 2b. One-time notice on the first day after quarter end ───────────────
export async function sendPostQuarterNotice(params: {
  toEmail: string;
  toName: string;
  audience: "employee" | "supervisor";
  quarter: Quarter;
  year: number;
  lockDate: string | Date;
  employeeName: string;
}): Promise<SendResult> {
  const { toEmail, toName, audience, quarter, year, lockDate, employeeName } = params;
  const label = quarter === "Q4" ? `${quarter} (Annual) ${year}` : `${quarter} ${year}`;
  const graceDays = graceDaysAfterQuarterEnd(quarter);
  const action =
    audience === "employee"
      ? "complete your self-assessment"
      : `complete the supervisor evaluation and final review for ${employeeName}`;
  const html = wrapEmail(
    `${label} — ${graceDays} days left to complete`,
    `<p>Hi ${escapeHtml(toName)},</p>
     <p>The <strong>${escapeHtml(label)}</strong> quarter has ended. You have <strong>${graceDays} days</strong> to ${escapeHtml(action)}.</p>
     <p><strong>Locks on: ${formatDeadline(lockDate)}</strong></p>
     ${
       audience === "supervisor"
         ? `<p>If not completed by then, a 10-point deduction will apply to your own appraisal score. You may submit one justification request if needed.</p>`
         : `<p>If your supervisor completes their side in time, no penalty applies to you.</p>`
     }`,
  );
  const text = `${label} quarter ended — ${graceDays} days left. Locks ${formatDeadline(lockDate)}.`;
  return sendViaResend({
    to: toEmail,
    subject: `${graceDays} days left — ${label} appraisal`,
    html,
    text,
  });
}

// ── 3. Employee submitted self-assessment → notify supervisor ────────────
export async function sendSupervisorEvaluationDueEmail(params: {
  supervisorEmail: string;
  supervisorName: string;
  employeeName: string;
  quarter: Quarter;
  year: number;
  deadlineAt: string | Date;
  /** Deep-link to the appraisal so the supervisor can open their evaluation. */
  appraisalId?: string | number | null;
}): Promise<SendResult> {
  const {
    supervisorEmail,
    supervisorName,
    employeeName,
    quarter,
    year,
    deadlineAt,
    appraisalId,
  } = params;
  const label =
    quarter === "Q4" ? `${quarter} (Annual) ${year}` : `${quarter} ${year}`;
  const formUrl = appraisalId
    ? `${getAppBaseUrl()}/dashboard/humanCapital/appraisal/appraisalForms?id=${appraisalId}`
    : `${getAppBaseUrl()}/dashboard/humanCapital/appraisal`;
  const loginUrl = `${getAppBaseUrl()}/login`;

  const html = wrapEmail(
    `Supervisor evaluation required — ${label}`,
    `<p>Dear ${escapeHtml(supervisorName)},</p>
     <p><strong>${escapeHtml(employeeName)}</strong> has completed their self-assessment for the <strong>${escapeHtml(label)}</strong> performance appraisal.</p>
     <p>Please sign in to the Wills Farms dashboard and complete your supervisor evaluation.</p>
     <p style="margin: 20px 0;">
       <a href="${escapeHtml(formUrl)}"
          style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">
         Complete supervisor evaluation
       </a>
     </p>
     <p style="font-size:13px;color:#6b7280;">
       Or <a href="${escapeHtml(loginUrl)}" style="color:#1e3a5f;">sign in here</a>, then open Appraisals from the sidebar.
     </p>
     <p><strong>Completion deadline: ${formatDeadline(deadlineAt)}</strong></p>
     <p style="font-size:13px;color:#6b7280;">
       If the supervisor evaluation is not completed by this date, the appraisal will lock automatically and a 10-point deduction may apply to your own appraisal for this quarter, unless a justification is approved.
     </p>`,
  );
  const text = [
    `Dear ${supervisorName},`,
    ``,
    `${employeeName} has completed their self-assessment for the ${label} performance appraisal.`,
    ``,
    `Please sign in and complete your supervisor evaluation:`,
    formUrl,
    ``,
    `Sign in: ${loginUrl}`,
    `Completion deadline: ${formatDeadline(deadlineAt)}`,
    ``,
    `If the evaluation is not completed by this date, the appraisal will lock automatically.`,
  ].join("\n");

  return sendViaResend({
    to: supervisorEmail,
    subject: `Action required: supervisor evaluation for ${employeeName} — ${label}`,
    html,
    text,
  });
}

// ── 4. Appraisal locked due to supervisor inaction (penalty notice) ──────
export async function sendSupervisorPenaltyEmail(params: {
  supervisorEmail: string;
  supervisorName: string;
  employeeName: string;
  quarter: Quarter;
  year: number;
  pointsDeducted: number;
}): Promise<SendResult> {
  const { supervisorEmail, supervisorName, employeeName, quarter, year, pointsDeducted } = params;
  const label = quarter === "Q4" ? `${quarter} (Annual) ${year}` : `${quarter} ${year}`;
  const html = wrapEmail(
    `Appraisal locked — ${pointsDeducted}-point deduction applied`,
    `<p>Hi ${escapeHtml(supervisorName)},</p>
     <p>${escapeHtml(employeeName)}'s <strong>${escapeHtml(label)}</strong> appraisal has locked because your evaluation wasn't completed by the deadline.</p>
     <p>A <strong>${pointsDeducted}-point deduction</strong> has been applied to your own ${escapeHtml(label)} appraisal score.</p>
     <p>If you believe this should be waived, submit a Justification Form explaining the delay. It will be reviewed by a Manager, Admin, Super Admin, or an L5+ employee, who can unlock the appraisal and waive the deduction if the reason is accepted.</p>`,
  );
  const text = `${employeeName}'s ${label} appraisal locked because your evaluation was late. A ${pointsDeducted}-point deduction has been applied to your own score. Submit a Justification Form to request a waiver.`;
  return sendViaResend({
    to: supervisorEmail,
    subject: `Appraisal locked & ${pointsDeducted}-point deduction — ${label}`,
    html,
    text,
  });
}

// ── 5. Justification decision (to supervisor and, separately, employee) ─
export async function sendJustificationDecisionEmail(params: {
  toEmail: string;
  toName: string;
  approved: boolean;
  employeeName: string;
  quarter: Quarter;
  year: number;
  reviewerName: string;
  reviewNotes?: string | null;
}): Promise<SendResult> {
  const { toEmail, toName, approved, employeeName, quarter, year, reviewerName, reviewNotes } = params;
  const label = quarter === "Q4" ? `${quarter} (Annual) ${year}` : `${quarter} ${year}`;
  const html = wrapEmail(
    approved ? "Justification approved — deduction waived" : "Justification rejected — deduction stands",
    `<p>Hi ${escapeHtml(toName)},</p>
     <p>The justification submitted for ${escapeHtml(employeeName)}'s <strong>${escapeHtml(label)}</strong> appraisal has been
     <strong>${approved ? "approved" : "rejected"}</strong> by ${escapeHtml(reviewerName)}.</p>
     ${approved
       ? `<p>The 10-point deduction has been waived. The appraisal has been reopened — you have <strong>10 days</strong> to complete the supervisor evaluation and final review. If not completed in time, a 15-point deduction will apply to the supervisor and a 5-point deduction to the employee, with no further appeals.</p>`
       : "<p>The 10-point deduction stands. The appraisal remains locked. No further appeals are permitted for this quarter.</p>"}
     ${reviewNotes ? `<p><strong>Reviewer notes:</strong> ${escapeHtml(reviewNotes)}</p>` : ""}`,
  );
  const text = `Justification for ${employeeName}'s ${label} appraisal was ${approved ? "approved" : "rejected"} by ${reviewerName}.`;
  return sendViaResend({
    to: toEmail,
    subject: `Justification ${approved ? "approved" : "rejected"} — ${label}`,
    html,
    text,
  });
}

// ── 6. Second lock after failed reopen window ────────────────────────────
export async function sendReopenFailureEmail(params: {
  toEmail: string;
  toName: string;
  audience: "employee" | "supervisor";
  employeeName: string;
  quarter: Quarter;
  year: number;
  supervisorPoints: number;
  employeePoints: number;
}): Promise<SendResult> {
  const { toEmail, toName, audience, employeeName, quarter, year, supervisorPoints, employeePoints } = params;
  const label = quarter === "Q4" ? `${quarter} (Annual) ${year}` : `${quarter} ${year}`;
  const html = wrapEmail(
    `Appraisal locked — penalties applied`,
    audience === "supervisor"
      ? `<p>Hi ${escapeHtml(toName)},</p>
         <p>The reopened window for ${escapeHtml(employeeName)}'s <strong>${escapeHtml(label)}</strong> appraisal has expired without a completed final review.</p>
         <p>A <strong>${supervisorPoints}-point deduction</strong> has been applied to your own ${escapeHtml(label)} appraisal score. No further appeals are permitted.</p>`
      : `<p>Hi ${escapeHtml(toName)},</p>
         <p>Your <strong>${escapeHtml(label)}</strong> appraisal has locked again because the final review was not completed within the allowed window.</p>
         <p>A <strong>${employeePoints}-point deduction</strong> has been applied to your quarter score.</p>`,
  );
  const text =
    audience === "supervisor"
      ? `${label} reopen window expired. ${supervisorPoints}-point deduction applied to your score.`
      : `${label} locked again. ${employeePoints}-point deduction applied to your quarter score.`;
  return sendViaResend({ to: toEmail, subject: `Appraisal locked — ${label}`, html, text });
}
