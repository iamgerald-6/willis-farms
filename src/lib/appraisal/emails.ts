import type { Quarter } from "./sections";
import { graceDaysAfterQuarterEnd } from "./deadlines";

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
    const from =
      process.env.RESEND_FROM_EMAIL ?? "Wills Farms HR <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: process.env.CAREERS_REPLY_TO_EMAIL ?? "info@willsfarms.com",
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err?.message ?? "Unknown error sending email" };
  }
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
}): Promise<SendResult> {
  const { supervisorEmail, supervisorName, employeeName, quarter, year, deadlineAt } = params;
  const label = quarter === "Q4" ? `${quarter} (Annual) ${year}` : `${quarter} ${year}`;
  const html = wrapEmail(
    `${employeeName} has completed their self-assessment`,
    `<p>Hi ${escapeHtml(supervisorName)},</p>
     <p><strong>${escapeHtml(employeeName)}</strong> has submitted their self-assessment for <strong>${escapeHtml(label)}</strong>. Your evaluation is now due.</p>
     <p><strong>Deadline: ${formatDeadline(deadlineAt)}</strong></p>
     <p>If you don't complete your evaluation by the deadline, the appraisal will lock and a 10-point deduction will apply to your own appraisal score for this quarter, unless you submit a justification that gets approved.</p>`,
  );
  const text = `${employeeName} submitted their self-assessment for ${label}. Please complete your evaluation by ${formatDeadline(deadlineAt)}.`;
  return sendViaResend({
    to: supervisorEmail,
    subject: `Action needed: evaluate ${employeeName} — ${label}`,
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
