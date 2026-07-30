import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Resend } from "resend";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import { computeDisplayStatus } from "@/lib/taskAccessControl";
import { fetchUserNames } from "@/lib/taskManagerData";
import MonthlyReportDocument, { MonthlyReportData, ReportProject } from "@/lib/reports/MonthlyReportDocument";

const resend = new Resend(process.env.RESEND_API_KEY);

// POST /api/task-manager/reports/send — Senior Management only.
// Builds the PDF (overall + per-project breakdown) and emails it as an
// attachment via Resend, with a link back to the live dashboard. Logs the
// send to tm_monthly_reports.
export async function POST(req: NextRequest) {
  try {
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    const { period_start, period_end, recipients } = await req.json();
    if (!period_start || !period_end || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: "period_start, period_end and at least one recipient are required" }, { status: 400 });
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
    let overallTotal = 0, overallOverdue = 0, overallInProgress = 0, overallCompleted = 0;

    for (const project of projects ?? []) {
      const projectTasks = (allTasks ?? []).filter((t) => t.project_id === project.id);
      const activeTasks = projectTasks.filter((t) => t.lifecycle_status === "active");
      const completedInPeriod = projectTasks.filter(
        (t) => t.lifecycle_status === "completed" && t.completed_at && t.completed_at >= period_start && t.completed_at <= period_end,
      );

      let overdue = 0, inProgress = 0;
      const taskRows = activeTasks.map((t) => {
        const status = computeDisplayStatus(t.due_date, t.lifecycle_status, t.is_recurring);
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

    return NextResponse.json({ report: logEntry, sent: !!process.env.RESEND_API_KEY });
  } catch (err: any) {
    console.error("[POST /api/task-manager/reports/send]", err);
    return NextResponse.json({ error: err.message ?? "Failed to send report" }, { status: 500 });
  }
}
