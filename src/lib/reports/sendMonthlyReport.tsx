import { renderToBuffer } from "@react-pdf/renderer";
import { Resend } from "resend";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/taskManagerAuth";
import { computeDisplayStatus } from "@/lib/taskAccessControl";
import { fetchUserNames } from "@/lib/taskManagerData";
import { TASK_MANAGER_FROM_EMAIL } from "@/lib/taskManagerEmail";
import { getAppBaseUrl } from "@/lib/appUrl";
import MonthlyReportDocument, {
  MonthlyReportData,
  OwnerStat,
  ReportProjectBreakdown,
  ReportProjectGantt,
  ReportTask,
  UpcomingItem,
} from "@/lib/reports/MonthlyReportDocument";

const resend = new Resend(process.env.RESEND_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Stored on each tm_monthly_reports row as stats_snapshot so the *next*
// month's summary has something concrete to compare against — enough detail
// to spot a specific project or owner trending better/worse, not just the
// overall totals.
export interface ReportStatsSnapshot {
  periodLabel: string;
  overall: MonthlyReportData["overall"];
  projectCount: number;
  overdueByProject: { name: string; overdue: number; total: number }[];
  overdueByOwner: { name: string; overdue: number; total: number }[];
}

// Completed-task counts for a past period are always reconstructable
// exactly, no stored snapshot required — tm_tasks.completed_at and
// tm_task_completions.completed_at are timestamps written at the moment
// each task actually finished, so "what got completed in July" doesn't
// change no matter when you ask. Overdue counts don't have that property
// (see ReportStatsSnapshot's comment) — this is the one piece of real,
// reliable trend available before any snapshot has ever been stored.
export interface ReconstructedCompletionStats {
  periodLabel: string;
  overallCompleted: number;
  completedByProject: { name: string; completed: number }[];
  completedByOwner: { name: string; completed: number }[];
}

// The board-facing opening page of the report — two short paragraphs
// written by Claude from the same figures that drive the rest of the
// report (never invented numbers of its own), blending the month's outlook
// with concrete, actionable recommendations: what to fix, what's working
// and worth keeping, what to watch. Two independent sources of "last
// period" data feed this: previousCompletions is reconstructed fresh every
// time from completion timestamps, so it's reliable from the very first
// report ever sent; previousSnapshot only exists once at least one report
// has been generated since the stats_snapshot column was added, but adds
// real overdue trend on top once it does. If the API key is missing or the
// call fails, a plain templated paragraph takes over instead — a scheduled
// report should never fail to send just because the narrative couldn't be
// generated.
async function generateExecutiveSummary(
  current: ReportStatsSnapshot,
  previousSnapshot: ReportStatsSnapshot | null,
  previousCompletions: ReconstructedCompletionStats | null,
): Promise<string> {
  const fallback =
    `During ${current.periodLabel}, ${current.overall.total} tasks were active across ${current.projectCount} project${current.projectCount === 1 ? "" : "s"}, with ${current.overall.overdue} overdue and ${current.overall.completed} completed this period.\n\n` +
    `A full breakdown by project and owner follows on the pages below.`;

  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content:
            "You are writing the opening executive summary of Wills Farms Ltd's monthly Task Manager report, read by the board and senior managers. " +
            `Using only the data below for the period ${current.periodLabel}, write exactly two short paragraphs (4-5 sentences each) that give the manager real decision-making insight, not just a recap of numbers. ` +
            "Cover the overall outlook, then weave in concrete recommendations grounded in the data: what should be fixed or escalated (e.g. a specific project or owner with a persistent overdue problem), what's working well and worth maintaining, and anything trending the wrong way that's worth watching before it becomes a problem. " +
            (previousCompletions
              ? "Completion figures for the previous period are included below and are exact — use them freely to say whether output is rising, falling, or steady, and whether that's concentrated in particular projects or owners. "
              : "") +
            (previousSnapshot
              ? "A previous period's full figures (including overdue counts) are also included below for comparison — use them to speak to real overdue trend, not just this month in isolation. "
              : "No previous period's overdue figures are available yet, so don't claim or imply an overdue trend (rising/falling/persistent) — describe this month's overdue picture on its own terms instead, and lean on the completion trend above if it's available. ") +
            "Write in plain, professional prose — no bullet points, headers, or markdown formatting — and don't state any number, name, or trend that isn't directly supported by the data below. Return only the two paragraphs, separated by a blank line, nothing else.\n\n" +
            `Current period:\n${JSON.stringify(current, null, 2)}\n\n` +
            (previousCompletions ? `Previous period completions (exact):\n${JSON.stringify(previousCompletions, null, 2)}\n\n` : "") +
            (previousSnapshot ? `Previous period full figures:\n${JSON.stringify(previousSnapshot, null, 2)}` : ""),
        },
      ],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || fallback;
  } catch (err) {
    console.error("[sendMonthlyReport] executive summary generation failed, falling back to templated text", err);
    return fallback;
  }
}

// An equal-length window immediately before [period_start, period_end] —
// for a full calendar month this lands exactly on the previous calendar
// month (matching runScheduledMonthlyReportIfDue's own month arithmetic);
// for a custom range picked from the "Generate & Send" button it's the
// nearest sensible equivalent, since there's no single obvious "previous
// custom range" otherwise.
function previousPeriod(period_start: string, period_end: string): { start: string; end: string } {
  const startDate = new Date(`${period_start}T00:00:00Z`);
  const endDate = new Date(`${period_end}T00:00:00Z`);

  const isFullCalendarMonth =
    startDate.getUTCDate() === 1 &&
    endDate.getUTCFullYear() === startDate.getUTCFullYear() &&
    endDate.getUTCMonth() === startDate.getUTCMonth() &&
    endDate.getUTCDate() === new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0)).getUTCDate();

  if (isFullCalendarMonth) {
    const prevMonthEnd = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 0));
    const prevMonthStart = new Date(Date.UTC(prevMonthEnd.getUTCFullYear(), prevMonthEnd.getUTCMonth(), 1));
    return { start: prevMonthStart.toISOString().slice(0, 10), end: prevMonthEnd.toISOString().slice(0, 10) };
  }

  const periodLengthMs = endDate.getTime() - startDate.getTime();
  const prevEnd = new Date(startDate.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - periodLengthMs);
  return { start: prevStart.toISOString().slice(0, 10), end: prevEnd.toISOString().slice(0, 10) };
}

// Mirrors the completedInPeriod / recurringCompletionsInPeriod filtering
// used in the main per-project loop below, just run against an arbitrary
// window instead of the report's own period — reuses the same already-
// fetched allTasks/allCompletions rather than issuing new queries.
function computeCompletionStats(
  periodStart: string,
  periodEnd: string,
  periodLabel: string,
  projects: { id: string; name: string }[],
  allTasks: { project_id: string; owner_id: string | null; lifecycle_status: string; completed_at: string | null }[],
  allCompletions: { project_id: string; task_id: string; completed_at: string | null }[],
  taskById: Map<string, { owner_id: string | null }>,
  ownerNameOf: (ownerId: string | null) => string | null,
): ReconstructedCompletionStats {
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  let overallCompleted = 0;
  const byProject = new Map<string, number>();
  const byOwner = new Map<string, number>();

  const bumpProject = (projectId: string) => {
    const name = projectNameById.get(projectId);
    if (name) byProject.set(name, (byProject.get(name) ?? 0) + 1);
  };
  const bumpOwner = (ownerId: string | null) => {
    const name = ownerNameOf(ownerId);
    if (name) byOwner.set(name, (byOwner.get(name) ?? 0) + 1);
  };

  for (const t of allTasks) {
    if (t.lifecycle_status !== "completed" || !t.completed_at) continue;
    const day = t.completed_at.slice(0, 10);
    if (day < periodStart || day > periodEnd) continue;
    overallCompleted++;
    bumpProject(t.project_id);
    bumpOwner(t.owner_id);
  }

  for (const c of allCompletions) {
    if (!c.completed_at) continue;
    const day = c.completed_at.slice(0, 10);
    if (day < periodStart || day > periodEnd) continue;
    overallCompleted++;
    bumpProject(c.project_id);
    bumpOwner(taskById.get(c.task_id)?.owner_id ?? null);
  }

  return {
    periodLabel,
    overallCompleted,
    completedByProject: [...byProject.entries()].map(([name, completed]) => ({ name, completed })),
    completedByOwner: [...byOwner.entries()].map(([name, completed]) => ({ name, completed })),
  };
}

// Shared by both the manual "Generate & Send" button
// (src/pages/api/task-manager/reports/send.tsx) and the daily cron's
// scheduled-report check (src/lib/reports/scheduledReportRunner.ts) — this
// is the entire build-PDF/email-it/log-it pipeline, parameterized so
// neither caller has to duplicate it. Lives in src/lib/reports rather than
// src/pages/api because it's plain logic, not a route — but it still has
// to be imported only from Pages Router routes (never from src/app/api),
// since it pulls in @react-pdf/renderer. See the comment in send.tsx for
// why that matters.
export interface SendMonthlyReportParams {
  period_start: string;
  period_end: string;
  recipients: string[];
  // Null for an automatic/scheduled send — nothing to attribute it to.
  generatedByUserId: string | null;
  generatedByName: string;
}

export async function sendMonthlyReport(params: SendMonthlyReportParams) {
  const { period_start, period_end, recipients, generatedByUserId, generatedByName } = params;

  const { data: projects, error: projError } = await supabaseAdmin
    .from("tm_projects")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (projError) throw projError;

  const { data: allTasks, error: tasksError } = await supabaseAdmin
    .from("tm_tasks")
    .select("*")
    .in("lifecycle_status", ["active", "completed"]);
  if (tasksError) throw tasksError;

  // Recurring tasks never sit at lifecycle_status = 'completed' — each
  // cycle's completion cycles the same tm_tasks row straight back to
  // active with a new due_date (see performTaskCompletion in
  // taskManagerData.ts), so there'd be no "completed" row here to count
  // for the period. tm_task_completions is the history that survives that
  // — one row per cycle actually completed, independent of the task's
  // current due date.
  const { data: allCompletions, error: complError } = await supabaseAdmin.from("tm_task_completions").select("*");
  if (complError) throw complError;
  const taskById = new Map((allTasks ?? []).map((t) => [t.id, t]));

  const userNames = await fetchUserNames([...(allTasks ?? []).map((t) => t.owner_id), ...(allCompletions ?? []).map((c) => taskById.get(c.task_id)?.owner_id)]);
  const ownerNameOf = (ownerId: string | null) => (ownerId ? (userNames[ownerId] ?? "Unknown") : null);

  const projectBreakdown: ReportProjectBreakdown[] = [];
  const activeGanttByProject: ReportProjectGantt[] = [];
  const completedGanttByProject: ReportProjectGantt[] = [];
  const upcoming: UpcomingItem[] = [];

  let overallTotal = 0,
    overallOverdue = 0,
    overallInProgress = 0,
    overallNotStarted = 0,
    overallCompliantOngoing = 0,
    overallCompleted = 0;

  const ownerTallies: Record<string, { total: number; overdue: number; completed: number }> = {};
  const bump = (ownerId: string | null, field: "total" | "overdue" | "completed") => {
    if (!ownerId) return;
    const t = (ownerTallies[ownerId] ??= { total: 0, overdue: 0, completed: 0 });
    t[field] += 1;
  };

  for (const project of projects ?? []) {
    const projectTasks = (allTasks ?? []).filter((t) => t.project_id === project.id);
    const activeTasks = projectTasks.filter((t) => t.lifecycle_status === "active");
    const completedInPeriod = projectTasks.filter(
      (t) =>
        t.lifecycle_status === "completed" &&
        t.completed_at &&
        t.completed_at.slice(0, 10) >= period_start &&
        t.completed_at.slice(0, 10) <= period_end,
    );
    const recurringCompletionsInPeriod = (allCompletions ?? []).filter(
      (c) =>
        c.project_id === project.id &&
        c.completed_at &&
        c.completed_at.slice(0, 10) >= period_start &&
        c.completed_at.slice(0, 10) <= period_end,
    );

    let overdue = 0,
      inProgress = 0,
      notStarted = 0,
      compliantOngoing = 0;

    const activeTaskRows: ReportTask[] = activeTasks.map((t) => {
      const status = computeDisplayStatus(t.due_date, t.lifecycle_status, t.is_recurring, t.progress_percent);
      if (status === "Overdue") overdue++;
      else if (status === "In Progress") inProgress++;
      else if (status === "Compliant / Ongoing") compliantOngoing++;
      else if (status === "Not Started") notStarted++;

      bump(t.owner_id, "total");
      if (status === "Overdue") bump(t.owner_id, "overdue");

      if (t.due_date) {
        upcoming.push({ title: t.title, project_name: project.name, owner_name: ownerNameOf(t.owner_id), due_date: t.due_date });
      }

      return {
        title: t.title,
        owner_name: ownerNameOf(t.owner_id),
        due_date: t.due_date,
        display_status: status,
        progress_percent: t.progress_percent ?? 0,
      };
    });

    const completedTaskRows: ReportTask[] = completedInPeriod.map((t) => {
      bump(t.owner_id, "total");
      bump(t.owner_id, "completed");
      return {
        title: t.title,
        owner_name: ownerNameOf(t.owner_id),
        due_date: t.due_date,
        display_status: "Completed",
        progress_percent: 100,
      };
    });

    const recurringCompletedRows: ReportTask[] = recurringCompletionsInPeriod.map((c) => {
      const sourceTask = taskById.get(c.task_id);
      const ownerId = sourceTask?.owner_id ?? null;
      bump(ownerId, "total");
      bump(ownerId, "completed");
      return {
        title: sourceTask?.title ?? "Unknown task",
        owner_name: ownerNameOf(ownerId),
        due_date: c.due_date,
        display_status: "Completed",
        progress_percent: 100,
      };
    });

    const allCompletedRows = [...completedTaskRows, ...recurringCompletedRows];
    const totalCompletedThisProject = completedInPeriod.length + recurringCompletionsInPeriod.length;

    overallTotal += activeTasks.length;
    overallOverdue += overdue;
    overallInProgress += inProgress;
    overallNotStarted += notStarted;
    overallCompliantOngoing += compliantOngoing;
    overallCompleted += totalCompletedThisProject;

    if (activeTasks.length === 0 && totalCompletedThisProject === 0) continue;

    const sortedActiveRows = [...activeTaskRows].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

    projectBreakdown.push({
      name: project.name,
      total: activeTasks.length,
      overdue,
      inProgress,
      notStarted,
      compliantOngoing,
      completed: totalCompletedThisProject,
      upcoming: sortedActiveRows.filter((t) => t.due_date).slice(0, 5),
    });

    activeGanttByProject.push({ name: project.name, tasks: sortedActiveRows });
    completedGanttByProject.push({ name: project.name, tasks: allCompletedRows });
  }

  const ownerStats: OwnerStat[] = Object.entries(ownerTallies)
    .map(([ownerId, t]) => {
      const onTrack = t.total - t.overdue - t.completed;
      return {
        name: userNames[ownerId] ?? "Unknown",
        total: t.total,
        overdue: t.overdue,
        completed: t.completed,
        onTrack: onTrack < 0 ? 0 : onTrack,
        overduePct: t.total > 0 ? Math.round((t.overdue / t.total) * 100) : 0,
        completedPct: t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0,
      };
    })
    .sort((a, b) => b.overduePct - a.overduePct || b.overdue - a.overdue);

  upcoming.sort((a, b) => a.due_date.localeCompare(b.due_date));

  const dashboardUrl = `${getAppBaseUrl()}/dashboard/taskManager`;
  const periodLabel = `${new Date(period_start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} – ${new Date(period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;

  // The full picture, not just a top-3 — next month's comparison needs
  // every project/owner that had any overdue tasks, not only the worst of
  // this month's, or a project improving off a low base would just vanish
  // from the data instead of showing as a positive trend.
  const currentSnapshot: ReportStatsSnapshot = {
    periodLabel,
    overall: {
      total: overallTotal,
      overdue: overallOverdue,
      inProgress: overallInProgress,
      notStarted: overallNotStarted,
      compliantOngoing: overallCompliantOngoing,
      completed: overallCompleted,
    },
    projectCount: projectBreakdown.length,
    overdueByProject: projectBreakdown.filter((p) => p.overdue > 0).map((p) => ({ name: p.name, overdue: p.overdue, total: p.total })),
    overdueByOwner: ownerStats.filter((o) => o.overdue > 0).map((o) => ({ name: o.name, overdue: o.overdue, total: o.total })),
  };

  // Most recent prior report that actually has a snapshot to compare
  // against — older reports sent before this feature existed won't have
  // one, and generateExecutiveSummary is told explicitly when there's
  // nothing to compare against rather than being left to guess.
  const { data: previousReport } = await supabaseAdmin
    .from("tm_monthly_reports")
    .select("stats_snapshot")
    .lt("period_end", period_start)
    .not("stats_snapshot", "is", null)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousSnapshot: ReportStatsSnapshot | null = (previousReport?.stats_snapshot as ReportStatsSnapshot | undefined) ?? null;

  // Reliable regardless of whether a stored snapshot exists — reconstructed
  // straight from completion timestamps that were already going to be in
  // allTasks/allCompletions for this run.
  const prevWindow = previousPeriod(period_start, period_end);
  const prevPeriodLabel = `${new Date(prevWindow.start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} – ${new Date(prevWindow.end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
  const previousCompletions = computeCompletionStats(
    prevWindow.start,
    prevWindow.end,
    prevPeriodLabel,
    projects ?? [],
    allTasks ?? [],
    allCompletions ?? [],
    taskById,
    ownerNameOf,
  );

  const executiveSummary = await generateExecutiveSummary(currentSnapshot, previousSnapshot, previousCompletions);

  const reportData: MonthlyReportData = {
    periodLabel,
    generatedAt: new Date().toISOString(),
    generatedByName,
    dashboardUrl,
    executiveSummary,
    overall: {
      total: overallTotal,
      overdue: overallOverdue,
      inProgress: overallInProgress,
      notStarted: overallNotStarted,
      compliantOngoing: overallCompliantOngoing,
      completed: overallCompleted,
    },
    upcoming: upcoming.slice(0, 8),
    projectBreakdown,
    activeGanttByProject,
    completedGanttByProject,
    ownerStats,
  };

  const pdfBuffer = await renderToBuffer(<MonthlyReportDocument data={reportData} />);

  if (process.env.RESEND_API_KEY) {
    await resend.emails.send({
      from: TASK_MANAGER_FROM_EMAIL,
      to: recipients,
      subject: `Task Manager Monthly Report — ${periodLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 560px;">
          <h2 style="color: #b91c1c;">Task Manager Monthly Report</h2>
          <p><strong>Period:</strong> ${periodLabel}</p>
          <p>${overallTotal} active tasks across ${projectBreakdown.length} project${projectBreakdown.length === 1 ? "" : "s"} — ${overallOverdue} overdue, ${overallCompleted} completed this period.</p>
          <p>The full breakdown is attached as a PDF. For live status and to make changes, open the dashboard:</p>
          <p><a href="${dashboardUrl}" style="color:#b91c1c;">${dashboardUrl}</a></p>
          <p style="font-size:12px;color:#999;margin-top:24px;">Generated by ${generatedByName} on ${new Date().toLocaleString("en-GB")}.</p>
        </div>
      `,
      attachments: [
        {
          filename: `task-manager-report-${period_start}.pdf`,
          content: pdfBuffer.toString("base64"),
        },
      ],
    });
  } else {
    console.warn("[sendMonthlyReport] RESEND_API_KEY not set — skipping actual email send (report was still generated & logged).");
  }

  const { data: logEntry, error: logError } = await supabaseAdmin
    .from("tm_monthly_reports")
    .insert([
      {
        period_start,
        period_end,
        sent_to: recipients,
        generated_by: generatedByUserId,
        stats_snapshot: currentSnapshot,
      },
    ])
    .select()
    .single();
  if (logError) throw logError;

  return { report: logEntry, sent: !!process.env.RESEND_API_KEY };
}
