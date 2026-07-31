import type { NextApiRequest, NextApiResponse } from "next";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Resend } from "resend";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import { computeDisplayStatus } from "@/lib/taskAccessControl";
import { fetchUserNames } from "@/lib/taskManagerData";
import MonthlyReportDocument, {
  MonthlyReportData,
  OwnerStat,
  ReportProjectBreakdown,
  ReportProjectGantt,
  ReportTask,
  UpcomingItem,
} from "@/lib/reports/MonthlyReportDocument";

const resend = new Resend(process.env.RESEND_API_KEY);

// This lives in the Pages Router (src/pages/api/...) rather than the App
// Router (src/app/api/...) that every other Task Manager route uses. That's
// deliberate, not an oversight: @react-pdf/renderer's renderToBuffer()
// crashes with "Minified React error #31" specifically inside Next's App
// Router request handling (a currently-unresolved upstream issue — see
// https://github.com/diegomura/react-pdf/issues/2994 and
// https://github.com/diegomura/react-pdf/issues/2940). Confirmed via a
// side-by-side test: the exact same component/data/react-pdf version
// worked from a Pages API route and from a plain Node script, and failed
// identically from an App Router route regardless of bundler (webpack vs
// Turbopack), react-pdf version (3.4.4 vs 4.x), or reactStrictMode. If
// react-pdf ships a fix for the App Router case later, this can move back
// to src/app/api/task-manager/reports/send/route.tsx to match the rest of
// the app — until then, leave it here.
//
// requireSeniorManagement()/getRequestUser() only read the Authorization
// header, so a minimal object with a fetch-style headers.get() is enough
// to reuse them as-is rather than duplicating the auth/role-lookup logic.
function toNextRequest(req: NextApiRequest): NextRequest {
  return {
    headers: {
      get: (name: string) => {
        const value = req.headers[name.toLowerCase()];
        return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
      },
    },
  } as unknown as NextRequest;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireSeniorManagement(toNextRequest(req));
    if (!user) return res.status(403).json({ error: "Forbidden — Senior Management only" });

    const { period_start, period_end, recipients } = req.body ?? {};
    if (!period_start || !period_end || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "period_start, period_end and at least one recipient are required" });
    }

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

    const userNames = await fetchUserNames((allTasks ?? []).map((t) => t.owner_id));
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

    // owner_id -> running tallies, resolved to names and turned into
    // OwnerStat[] once every project has been walked.
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
        (t) => t.lifecycle_status === "completed" && t.completed_at && t.completed_at >= period_start && t.completed_at <= period_end,
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

      overallTotal += activeTasks.length;
      overallOverdue += overdue;
      overallInProgress += inProgress;
      overallNotStarted += notStarted;
      overallCompliantOngoing += compliantOngoing;
      overallCompleted += completedInPeriod.length;

      if (activeTasks.length === 0 && completedInPeriod.length === 0) continue;

      const sortedActiveRows = [...activeTaskRows].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

      projectBreakdown.push({
        name: project.name,
        total: activeTasks.length,
        overdue,
        inProgress,
        notStarted,
        compliantOngoing,
        completed: completedInPeriod.length,
        tasks: sortedActiveRows,
      });

      activeGanttByProject.push({ name: project.name, tasks: sortedActiveRows });
      completedGanttByProject.push({ name: project.name, tasks: completedTaskRows });
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

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://willsfarms.com"}/dashboard/taskManager`;
    const periodLabel = `${new Date(period_start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} – ${new Date(period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;

    const reportData: MonthlyReportData = {
      periodLabel,
      generatedAt: new Date().toISOString(),
      generatedByName: user.name,
      dashboardUrl,
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
        from: "Wills Farms Task Manager <onboarding@resend.dev>",
        to: recipients,
        subject: `Task Manager Monthly Report — ${periodLabel}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 560px;">
            <h2 style="color: #b91c1c;">Task Manager Monthly Report</h2>
            <p><strong>Period:</strong> ${periodLabel}</p>
            <p>${overallTotal} active tasks across ${projectBreakdown.length} project${projectBreakdown.length === 1 ? "" : "s"} — ${overallOverdue} overdue, ${overallCompleted} completed this period.</p>
            <p>The full breakdown is attached as a PDF. For live status and to make changes, open the dashboard:</p>
            <p><a href="${dashboardUrl}" style="color:#b91c1c;">${dashboardUrl}</a></p>
            <p style="font-size:12px;color:#999;margin-top:24px;">Generated by ${user.name} on ${new Date().toLocaleString("en-GB")}.</p>
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
      console.warn("[reports/send] RESEND_API_KEY not set — skipping actual email send (report was still generated & logged).");
    }

    const { data: logEntry, error: logError } = await supabaseAdmin
      .from("tm_monthly_reports")
      .insert([
        {
          period_start,
          period_end,
          sent_to: recipients,
          generated_by: user.id,
        },
      ])
      .select()
      .single();
    if (logError) throw logError;

    return res.status(200).json({ report: logEntry, sent: !!process.env.RESEND_API_KEY });
  } catch (err: any) {
    console.error("[POST /api/task-manager/reports/send]", err);
    return res.status(500).json({ error: err.message ?? "Failed to send report" });
  }
}
