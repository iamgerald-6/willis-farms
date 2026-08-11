import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/taskManagerAuth";
import { fetchProjectNames } from "@/lib/taskManagerData";
import { TASK_MANAGER_FROM_EMAIL } from "@/lib/taskManagerEmail";
import { getAppBaseUrl } from "@/lib/appUrl";

const resend = new Resend(process.env.RESEND_API_KEY);

interface ReminderTaskRow {
  id: string;
  project_id: string;
  title: string;
  owner_id: string;
  due_date: string;
}

interface ReminderTaskInfo {
  id: string;
  title: string;
  due_date: string;
  project_name: string | null;
  days_left: number;
}

// due_date is a plain "YYYY-MM-DD" — parsed and compared as UTC midnight so
// this doesn't depend on the server's local timezone. Ghana (where the farm
// operates) is UTC+0 year-round, so UTC "today" is always the farm's today.
function daysUntil(dueDate: string): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const dueUTC = Date.UTC(y, m - 1, d);
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((dueUTC - todayUTC) / 86_400_000);
}

/**
 * Called every day by the cron job, but only actually sends on Mondays
 * (see the day-of-week check below) — the underlying cron itself still
 * runs daily because the same job also checks the monthly-report schedule,
 * which needs a daily check regardless of what day reminders go out on.
 *
 * Each task owner gets one weekly digest email listing everything
 * currently overdue and everything due within `days_before_due` days —
 * a fresh snapshot every Monday, not a "notify once" event. That's
 * deliberately simpler than the old daily version: there's no dedup log to
 * maintain, because re-running this (e.g. via "Send test now") just
 * recomputes the same accurate list rather than needing to remember what
 * was already sent.
 *
 * Pass `force: true` to ignore the Monday check — used by the "Send test
 * now" button so testing works on any day of the week.
 */
export async function sendDeadlineReminders(options?: { force?: boolean }) {
  const { data: settings } = await supabaseAdmin.from("tm_reminder_settings").select("*").limit(1).single();
  if (!settings) return { skipped: true, reason: "no reminder settings row configured" };
  if (!settings.enabled) return { skipped: true, reason: "reminders disabled" };

  // getUTCDay(): 0 = Sunday, 1 = Monday, ... 6 = Saturday.
  if (!options?.force && new Date().getUTCDay() !== 1) {
    return { skipped: true, reason: "reminders only go out on Mondays" };
  }

  // Optional — extra addresses copied on every reminder email in addition
  // to the task owner. Everyone with a task is already notified
  // automatically via owner_id; this is just a backup/extra-visibility
  // list, not the primary recipient mechanism.
  const ccRecipients: string[] = Array.isArray(settings.cc_recipients) ? settings.cc_recipients : [];

  const { data: tasks, error: tasksError } = await supabaseAdmin
    .from("tm_tasks")
    .select("id, project_id, title, owner_id, due_date")
    .eq("lifecycle_status", "active")
    .not("due_date", "is", null)
    .not("owner_id", "is", null);
  if (tasksError) throw tasksError;

  const allTasks = (tasks ?? []) as ReminderTaskRow[];
  const dueSoonTasks = allTasks.filter((t) => {
    const d = daysUntil(t.due_date);
    return d >= 0 && d <= settings.days_before_due;
  });
  const overdueTasks = allTasks.filter((t) => daysUntil(t.due_date) < 0);

  if (dueSoonTasks.length === 0 && overdueTasks.length === 0) {
    return { skipped: false, dueSoonSent: 0, overdueSent: 0 };
  }

  const ownerIds = [...new Set([...dueSoonTasks, ...overdueTasks].map((t) => t.owner_id))];
  const { data: owners } = await supabaseAdmin.from("users").select("user_id, email, first_name, last_name").in("user_id", ownerIds);
  const ownerById = new Map((owners ?? []).map((u) => [u.user_id, u]));

  const projectNames = await fetchProjectNames([...dueSoonTasks, ...overdueTasks].map((t) => t.project_id));
  const toInfo = (t: ReminderTaskRow): ReminderTaskInfo => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    project_name: projectNames[t.project_id] ?? null,
    days_left: daysUntil(t.due_date),
  });

  const byOwner = new Map<string, { dueSoon: ReminderTaskInfo[]; overdue: ReminderTaskInfo[] }>();
  for (const t of dueSoonTasks) {
    const bucket = byOwner.get(t.owner_id) ?? { dueSoon: [], overdue: [] };
    bucket.dueSoon.push(toInfo(t));
    byOwner.set(t.owner_id, bucket);
  }
  for (const t of overdueTasks) {
    const bucket = byOwner.get(t.owner_id) ?? { dueSoon: [], overdue: [] };
    bucket.overdue.push(toInfo(t));
    byOwner.set(t.owner_id, bucket);
  }

  const dashboardUrl = `${getAppBaseUrl()}/dashboard/taskManager`;
  let dueSoonSent = 0;
  let overdueSent = 0;

  for (const [ownerId, bucket] of byOwner) {
    const owner = ownerById.get(ownerId);
    if (!owner?.email) continue;

    const ownerName = `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() || "there";
    const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const listItem = (t: ReminderTaskInfo, note: string) =>
      `<li><strong>${t.title}</strong>${t.project_name ? ` — ${t.project_name}` : ""} (due ${fmtDate(t.due_date)}, ${note})</li>`;

    const sections: string[] = [];
    if (bucket.dueSoon.length > 0) {
      sections.push(
        `<p><strong>Tasks coming up soon:</strong></p><ul>${bucket.dueSoon
          .map((t) => listItem(t, `${t.days_left} day${t.days_left === 1 ? "" : "s"} left`))
          .join("")}</ul>`,
      );
    }
    if (bucket.overdue.length > 0) {
      sections.push(
        `<p><strong style="color:#b91c1c;">Tasks overdue:</strong></p><ul>${bucket.overdue
          .map((t) => listItem(t, `${Math.abs(t.days_left)} day${Math.abs(t.days_left) === 1 ? "" : "s"} overdue`))
          .join("")}</ul>`,
      );
    }

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: TASK_MANAGER_FROM_EMAIL,
        to: [owner.email],
        cc: ccRecipients.length > 0 ? ccRecipients : undefined,
        subject: bucket.overdue.length > 0 ? "Task Manager: your weekly task summary (overdue items)" : "Task Manager: your weekly task summary",
        html: `
          <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 560px;">
            <h2 style="color: #b91c1c;">Weekly task summary</h2>
            <p>Hi ${ownerName},</p>
            ${sections.join("")}
            <p><a href="${dashboardUrl}" style="color:#b91c1c;">Open the dashboard</a></p>
          </div>
        `,
      });
    } else {
      console.warn(
        `[sendDeadlineReminders] RESEND_API_KEY not set — would have emailed ${owner.email} (${bucket.dueSoon.length} due-soon, ${bucket.overdue.length} overdue).`,
      );
    }

    dueSoonSent += bucket.dueSoon.length;
    overdueSent += bucket.overdue.length;
  }

  return { skipped: false, dueSoonSent, overdueSent };
}
