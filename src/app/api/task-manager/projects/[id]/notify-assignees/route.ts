import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import { sendAssignmentNotifications } from "@/lib/taskManagerNotifications";
import { isProjectSiteVisible } from "@/lib/taskManagerScope";

// POST /api/task-manager/projects/[id]/notify-assignees — Senior Management
// only. Manually triggered by the "Notify Assignees" button on the task
// list page — see sendAssignmentNotifications for why this isn't automatic.
// Emails everyone currently assigned an active task in this project one
// consolidated list of what they've got, with a dashboard link. Safe to
// click more than once — it's always a fresh snapshot of who's currently
// assigned what, not a "what's new since last time" diff.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  try {
    const { id } = await params;

    // Being Senior Management doesn't mean any site — same rule as
    // everywhere else.
    const { data: project } = await supabaseAdmin
      .from("tm_projects")
      .select("site_id, created_by")
      .eq("id", id)
      .maybeSingle();
    if (project && !isProjectSiteVisible(user, project)) {
      return NextResponse.json(
        { error: "Forbidden — this project isn't at a site you have access to." },
        { status: 403 },
      );
    }

    const result = await sendAssignmentNotifications(id);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[POST /api/task-manager/projects/[id]/notify-assignees]", err);
    return NextResponse.json({ error: err.message ?? "Failed to send notifications" }, { status: 500 });
  }
}
