import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/taskManagerAuth";
import { TASK_MANAGER_FROM_EMAIL } from "@/lib/taskManagerEmail";
import { getAppBaseUrl } from "@/lib/appUrl";

const resend = new Resend(process.env.RESEND_API_KEY);

interface AssignedTaskRow {
  id: string;
  title: string;
  owner_id: string;
}

/**
 * Manually triggered — not fired automatically on task creation or
 * assignment. Senior Management clicks "Notify Assignees" on a project's
 * task list whenever they want everyone currently assigned a task in that
 * project to hear about it (e.g. after adding tasks by hand, saving a batch
 * from document extraction, or any combination over time), rather than
 * every single task write sending its own email.
 *
 * Each owner gets one consolidated email listing every active task they're
 * currently assigned in this project, with a link to the dashboard. Same
 * "no dedup, always a fresh accurate snapshot" approach as the weekly
 * reminder digest (see sendReminders.ts) — clicking it again is always
 * safe, it just resends the current picture rather than trying to track
 * what was already sent.
 */
export async function sendAssignmentNotifications(projectId: string) {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("tm_projects")
    .select("id, name")
    .eq("id", projectId)
    .single();
  if (projectError || !project) return { error: "Project not found" as const };

  const { data: tasks, error: tasksError } = await supabaseAdmin
    .from("tm_tasks")
    .select("id, title, owner_id")
    .eq("project_id", projectId)
    .eq("lifecycle_status", "active")
    .not("owner_id", "is", null);
  if (tasksError) throw tasksError;

  const assignedTasks = (tasks ?? []) as AssignedTaskRow[];
  if (assignedTasks.length === 0) {
    return { notified: 0, tasksSent: 0, skippedNoEmail: 0 };
  }

  const ownerIds = [...new Set(assignedTasks.map((t) => t.owner_id))];
  const { data: owners } = await supabaseAdmin
    .from("users")
    .select("user_id, email, first_name, last_name")
    .in("user_id", ownerIds);
  const ownerById = new Map((owners ?? []).map((u) => [u.user_id, u]));

  const byOwner = new Map<string, AssignedTaskRow[]>();
  for (const t of assignedTasks) {
    const bucket = byOwner.get(t.owner_id) ?? [];
    bucket.push(t);
    byOwner.set(t.owner_id, bucket);
  }

  const dashboardUrl = `${getAppBaseUrl()}/dashboard/taskManager`;
  let notified = 0;
  let tasksSent = 0;
  let skippedNoEmail = 0;

  for (const [ownerId, ownerTasks] of byOwner) {
    const owner = ownerById.get(ownerId);
    if (!owner?.email) {
      skippedNoEmail++;
      continue;
    }

    const ownerName = `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() || "there";
    const plural = ownerTasks.length === 1 ? "" : "s";
    const listItems = ownerTasks.map((t) => `<li>${t.title}</li>`).join("");

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: TASK_MANAGER_FROM_EMAIL,
        to: [owner.email],
        subject: `You have ${ownerTasks.length} task${plural} in ${project.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 560px;">
            <h2 style="color: #b91c1c;">You've been assigned task${plural}</h2>
            <p>Hi ${ownerName},</p>
            <p>You're currently assigned the following task${plural} in <strong>${project.name}</strong>:</p>
            <ul>${listItems}</ul>
            <p><a href="${dashboardUrl}" style="color:#b91c1c;">Open the dashboard</a></p>
          </div>
        `,
      });
    } else {
      console.warn(
        `[sendAssignmentNotifications] RESEND_API_KEY not set — would have emailed ${owner.email} about ${ownerTasks.length} task(s).`,
      );
    }

    notified++;
    tasksSent += ownerTasks.length;
  }

  return { notified, tasksSent, skippedNoEmail };
}
