import type { NextApiRequest, NextApiResponse } from "next";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Resend } from "resend";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import { computeDisplayStatus } from "@/lib/taskAccessControl";
import { fetchUserNames } from "@/lib/taskManagerData";
import MonthlyReportDocument, { MonthlyReportData, ReportProject } from "@/lib/reports/MonthlyReportDocument";

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

    const reportProjects: ReportProject[] = [];
    let overallTotal = 0,
      overallOverdue = 0,
      overallInProgress = 0,
      overallCompleted = 0;

    for (const project of projects ?? []) {
      const projectTasks = (allTasks ?? []).filter((t) => t.project_id === project.id);
      const activeTasks = projectTasks.filter((t) => t.lifecycle_status === "active");
      const completedInPeriod = projectTasks.filter(
        (t) => t.lifecycle_status === "completed" && t.completed_at && t.completed_at >= period_start && t.completed_at <= period_end,
      );

      let overdue = 0,
        inProgress = 0;
      const taskRows = activeTasks.map((t) => {
        const status = computeDisplayStatus(t.due_date, t.lifecycle_status, t.is_recurring, t.progress_percent);
        if (status === "Overdue") overdue++;
        if (status === "In Progress") inProgress++;
        return { title: t.title, owner_name: t.owner_id ? (userNames[t.owner_id] ?? "Unknown") : null, due_date: t.due_date, display_status: status };
      });

      overallTotal += activeTasks.length;
      overallOverdue += overdue;
      overallInProgress += inProgress;
      overallCompleted += completedInPeriod.length;

      if (activeTasks.length === 0 && completedInPeriod.length === 0) continue;

      reportProjects.push({
        name: project.name,
        total: activeTasks.length,
        overdue,
        completed: completedInPeriod.length,
        tasks: taskRows.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")),
      });
    }

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://willsfarms.com"}/dashboard/taskManager`;
    const periodLabel = `${new Date(period_start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} – ${new Date(period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;

    const reportData: MonthlyReportData = {
      periodLabel,
      generatedAt: new Date().toISOString(),
      generatedByName: user.name,
      dashboardUrl,
      overall: { total: overallTotal, overdue: overallOverdue, inProgress: overallInProgress, completed: overallCompleted },
      projects: reportProjects,
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
            <p>${overallTotal} active tasks across ${reportProjects.length} project${reportProjects.length === 1 ? "" : "s"} — ${overallOverdue} overdue, ${overallCompleted} completed this period.</p>
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
